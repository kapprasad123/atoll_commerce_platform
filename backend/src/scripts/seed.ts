import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

async function runSeed() {
  const sqlPath = path.resolve(__dirname, '../../../database/seeds/001_demo_seed.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  console.log('Loading realistic demo seed data...');
  await pool.query(sql);
  console.log('Demo seed data loaded.');
  await pool.end();
}

runSeed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
