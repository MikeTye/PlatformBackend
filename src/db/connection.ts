import { Pool, type QueryResultRow } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST,         // carbon-mvp-db.xxxxxx.ap-southeast-1.rds.amazonaws.com
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,         // app_user
  password: process.env.DB_PASSWORD, // from RDS
  database: process.env.DB_NAME,     // your app DB, e.g. app_db
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<{ rows: T[] }> {
  const result = await pool.query<T>(text, params);
  return { rows: result.rows };
}