import type { Connection, RowDataPacket } from "mysql2/promise";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const MIGRATION_TABLE = "flyway_schema_history";

export async function runMigrations(connection: Connection): Promise<void> {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      installed_rank INT PRIMARY KEY,
      version VARCHAR(50),
      description VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL,
      script VARCHAR(1000) NOT NULL,
      checksum INT,
      installed_by VARCHAR(100) NOT NULL,
      installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_time INT NOT NULL,
      success TINYINT(1) NOT NULL
    )
  `);

  const migrationsDir = join(import.meta.dir, ".");
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT script FROM ${MIGRATION_TABLE} WHERE success = 1`
  );
  const applied = new Set((rows as RowDataPacket[]).map((r) => r.script as string));

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(join(migrationsDir, file), "utf-8");
    const start = Date.now();

    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await connection.execute(stmt);
    }

    const duration = Date.now() - start;
    const match = file.match(/^V(\d+)__(.+)\.sql$/);
    const version = match ? match[1] : null;
    const description = match ? match[2].replace(/_/g, " ") : file;

    const [rankResult] = await connection.execute<RowDataPacket[]>(
      `SELECT MAX(installed_rank) as max_rank FROM ${MIGRATION_TABLE}`
    );
    const maxRank = (rankResult as RowDataPacket[])[0]?.max_rank as number | null;
    const nextRank = (maxRank ?? 0) + 1;

    await connection.execute(
      `INSERT INTO ${MIGRATION_TABLE} (installed_rank, version, description, type, script, installed_by, execution_time, success)
       VALUES (?, ?, ?, 'SQL', ?, 'bun', ?, 1)`,
      [nextRank, version, description, file, duration]
    );

    console.log(`Applied migration: ${file}`);
  }
}
