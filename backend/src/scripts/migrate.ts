import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

async function runMigrations() {
  const sqlPath = path.resolve(__dirname, '../../../database/migrations/001_initial_schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  console.log('Applying PostgreSQL migration: 001_initial_schema.sql...');
  await pool.query(sql);
  console.log('Migration completed successfully.');
  await pool.end();
}

runMigrations().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
