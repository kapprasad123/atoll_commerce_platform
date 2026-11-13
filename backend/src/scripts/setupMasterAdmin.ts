/**
 * Secure Initial Master Administrator Setup Script
 * Never hardcodes production credentials. Reads from environment variables or CLI arguments
 * and hashes the password with bcrypt (cost 12).
 */
import bcrypt from 'bcryptjs';
import { pool } from '../config/db';

async function bootstrapMasterAdmin() {
  const email = process.env.INITIAL_MASTER_ADMIN_EMAIL || process.argv[2];
  const password = process.env.INITIAL_MASTER_ADMIN_PASSWORD || process.argv[3];
  const fullName = process.env.INITIAL_MASTER_ADMIN_NAME || 'Platform Master Administrator';

  if (!email || !password || password.length < 10) {
    console.error('Usage: INITIAL_MASTER_ADMIN_EMAIL=... INITIAL_MASTER_ADMIN_PASSWORD=... npm run setup:admin');
    console.error('Password must be at least 10 characters long.');
    process.exit(1);
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const res = await pool.query(
    `INSERT INTO master_administrators (full_name, email, password_hash, is_super_admin)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
     RETURNING id, full_name, email, created_at`,
    [fullName, email.toLowerCase().trim(), passwordHash]
  );

  console.log('Master Administrator configured:', res.rows[0]);
  await pool.end();
}

bootstrapMasterAdmin().catch((err) => {
  console.error('Failed to bootstrap Master Admin:', err);
  process.exit(1);
});
