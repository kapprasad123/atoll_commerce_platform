/**
 * Generates official WhatsApp Click-to-Chat (wa.me) and Viber links
 * prepopulated with Order ID, items, total currency amount, and bank details.
 * Never claims a message or payment was sent automatically; opens the native client.
 */
export function buildWhatsAppOrderUrl(phone: string, text: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function buildViberShareUrl(phone: string, text: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return `viber://forward?text=${encodeURIComponent(text + ' (Contact: +' + digits + ')')}`;
}
