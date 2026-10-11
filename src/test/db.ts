import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { beforeEach } from "vitest";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

// Derived from the schema so a new table is truncated without touching this file.
const tableList = Object.values(schema as Record<string, unknown>)
  .filter((value): value is PgTable => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`)
  .join(", ");

/** Empties every table in the test database. */
export async function truncateAll(): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${tableList} CASCADE`));
}

/**
 * Call at the top of an integration test file (`*.int.test.ts`). Returns the app's
 * Drizzle client, which points at this run's test database, and empties every table
 * before each test so tests never see each other's rows.
 */
export function setupTestDb() {
  beforeEach(truncateAll);
  return db;
}
