import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

export const query = async (text: string, params: any[] = []) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (err) {
    throw new Error(`Database query failed: ${(err as Error).message}`);
  }
};

export default pool;