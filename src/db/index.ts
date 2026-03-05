import { createPool, type Pool } from "mysql2/promise";
import { runMigrations } from "./migrate";

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    throw new Error("Database not initialized");
  }
  return pool;
}

export async function initDatabase(config: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}): Promise<void> {
  pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: false,
  });

  const connection = await pool.getConnection();
  try {
    await runMigrations(connection);
  } finally {
    connection.release();
  }
}
