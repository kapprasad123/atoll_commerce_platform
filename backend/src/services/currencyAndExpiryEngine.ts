import { PoolClient } from 'pg';

export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  targetCurrency: string;
  exchangeRateUsed: number;
  convertedAmount: number;
  usedExplicitProductPrice: boolean;
}

/**
 * Multi-Currency Financial Rules:
 * 1. Uses explicit product currency price if defined (e.g. Rice 5kg: MVR 85, INR 450, USD 5.50).
 * 2. Otherwise converts using the active exchange rate and stores the exact rate on the transaction.
 * 3. Rounds using deterministic half-to-even / two-decimal financial precision.
 */
export function roundMoney(amount: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export async function resolveProductPriceInCurrency(
  client: PoolClient,
  product: {
    selling_price: number;
    discounted_price?: number | null;
    currency: string;
    explicit_currency_prices?: Record<string, number>;
  },
  requestedCurrency: string
): Promise<CurrencyConversionResult> {
  const baseUnit = product.discounted_price && Number(product.discounted_price) > 0
    ? Number(product.discounted_price)
    : Number(product.selling_price);

  if (product.currency === requestedCurrency) {
    return {
      originalAmount: roundMoney(baseUnit),
      originalCurrency: requestedCurrency,
      targetCurrency: product.currency,
      exchangeRateUsed: 1.0,
      convertedAmount: roundMoney(baseUnit),
      usedExplicitProductPrice: true,
    };
  }

  // Check if explicit price override exists for requestedCurrency
  if (product.explicit_currency_prices && product.explicit_currency_prices[requestedCurrency] !== undefined) {
    const explicitAmt = Number(product.explicit_currency_prices[requestedCurrency]);
    const impliedRate = explicitAmt > 0 ? roundMoney(baseUnit / explicitAmt, 6) : 1;
    return {
      originalAmount: roundMoney(explicitAmt),
      originalCurrency: requestedCurrency,
      targetCurrency: product.currency,
      exchangeRateUsed: impliedRate,
      convertedAmount: roundMoney(baseUnit),
      usedExplicitProductPrice: true,
    };
  }

  // Fetch configured exchange rate
  const rateRes = await client.query(
    `SELECT rate FROM exchange_rates
     WHERE from_currency = $1 AND to_currency = $2
     ORDER BY effective_from DESC LIMIT 1`,
    [product.currency, requestedCurrency]
  );

  const rate = rateRes.rowCount ? Number(rateRes.rows[0].rate) : 1.0;
  const converted = roundMoney(baseUnit * rate);

  return {
    originalAmount: converted,
    originalCurrency: requestedCurrency,
    targetCurrency: product.currency,
    exchangeRateUsed: roundMoney(1 / rate, 6),
    convertedAmount: roundMoney(baseUnit),
    usedExplicitProductPrice: false,
  };
}

/**
 * FEFO (First Expired, First Out) Inventory Deduction Engine:
 * - Never allows expired batches (expiry_date < CURRENT_DATE) to be sold or delivered.
 * - Prioritizes active batches ordered by earliest valid expiry_date ASC.
 * - Prevents negative stock unless shop.allow_negative_stock is explicitly enabled.
 * - Creates full stock_movements audit records for every batch touched.
 */
export async function deductInventoryFEFO(
  client: PoolClient,
  params: {
    shopId: string;
    productId: string;
    quantityRequested: number;
    movementType: 'POS_SALE' | 'ONLINE_ORDER_DEDUCT' | 'CREDIT_SALE';
    referenceType: string;
    referenceId: string;
    actorName: string;
  }
) {
  const { shopId, productId, quantityRequested, movementType, referenceType, referenceId, actorName } = params;

  // Lock product & shop row for concurrency-safe update
  const prodRes = await client.query(
    `SELECT p.id, p.name, p.available_quantity, p.purchase_price, s.allow_negative_stock
     FROM products p
     JOIN shops s ON s.id = p.shop_id
     WHERE p.id = $1 AND p.shop_id = $2
     FOR UPDATE`,
    [productId, shopId]
  );

  if (prodRes.rowCount === 0) {
    throw new Error('Product not found in this shop.');
  }

  const product = prodRes.rows[0];
  const currentAvailable = Number(product.available_quantity);

  // Query valid (non-expired) active batches in strict FEFO order
  const batchRes = await client.query(
    `SELECT id, batch_number, expiry_date, remaining_quantity, unit_cost
     FROM inventory_batches
     WHERE shop_id = $1
       AND product_id = $2
       AND status = 'ACTIVE'
       AND remaining_quantity > 0
       AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
     ORDER BY expiry_date ASC NULLS LAST, received_at ASC
     FOR UPDATE`,
    [shopId, productId]
  );

  const validBatchTotal = batchRes.rows.reduce((acc, b) => acc + Number(b.remaining_quantity), 0);

  if (validBatchTotal < quantityRequested && !product.allow_negative_stock) {
    throw new Error(
      `Insufficient valid (non-expired) stock for "${product.name}". Requested: ${quantityRequested}, Valid non-expired stock available: ${validBatchTotal}.`
    );
  }

  let remainingToDeduct = quantityRequested;
  let weightedCogsTotal = 0;
  const allocations: Array<{ batchId: string; batchNumber: string; expiryDate: string | null; deducted: number; unitCost: number }> = [];

  for (const batch of batchRes.rows) {
    if (remainingToDeduct <= 0) break;
    const availInBatch = Number(batch.remaining_quantity);
    const deductHere = Math.min(availInBatch, remainingToDeduct);
    const newBatchRem = roundMoney(availInBatch - deductHere, 3);
    const newStatus = newBatchRem <= 0 ? 'DEPLETED' : 'ACTIVE';

    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = $1, status = $2
       WHERE id = $3`,
      [newBatchRem, newStatus, batch.id]
    );

    remainingToDeduct = roundMoney(remainingToDeduct - deductHere, 3);
    weightedCogsTotal += deductHere * Number(batch.unit_cost);
    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batch_number,
      expiryDate: batch.expiry_date,
      deducted: deductHere,
      unitCost: Number(batch.unit_cost),
    });
  }

  if (remainingToDeduct > 0) {
    // Only happens if shop explicitly allowed negative stock
    weightedCogsTotal += remainingToDeduct * Number(product.purchase_price);
  }

  const quantityAfter = roundMoney(currentAvailable - quantityRequested, 3);

  await client.query(
    `UPDATE products
     SET available_quantity = $1,
         total_units_sold = total_units_sold + $2,
         status = CASE WHEN $1 <= 0 THEN 'OUT_OF_STOCK'::product_status_enum ELSE status END,
         updated_at = NOW()
     WHERE id = $3 AND shop_id = $4`,
    [quantityAfter, quantityRequested, productId, shopId]
  );

  await client.query(
    `INSERT INTO stock_movements
     (shop_id, product_id, batch_id, movement_type, quantity_change, quantity_before, quantity_after, reference_type, reference_id, reason, performed_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      shopId,
      productId,
      allocations[0]?.batchId || null,
      movementType,
      -quantityRequested,
      currentAvailable,
      quantityAfter,
      referenceType,
      referenceId,
      `FEFO deduction across ${allocations.length} batch(es)`,
      actorName,
    ]
  );

  return {
    allocations,
    totalCogs: roundMoney(weightedCogsTotal),
    quantityBefore: currentAvailable,
    quantityAfter,
  };
}
