import { randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Integration test global setup: creates a fresh `rfq_test_<random>` database, applies
 * the drizzle/ migrations once, and drops it when the run ends.
 *
 * Every git worktree shares one Postgres container, so a fixed test database would let
 * parallel runs truncate each other's rows. A database per run cannot collide.
 */
export default async function setup(project: TestProject) {
  // DATABASE_URL comes from .env.test. Only its server and credentials are used.
  const serverUrl = process.env.DATABASE_URL;
  if (!serverUrl) throw new Error("DATABASE_URL is not set. It should come from .env.test.");

  const name = `rfq_test_${randomBytes(4).toString("hex")}`;
  const testUrl = new URL(serverUrl);
  testUrl.pathname = `/${name}`;

  await runOnServer(serverUrl, `CREATE DATABASE ${name}`);
  const dropDatabase = () => runOnServer(serverUrl, `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);

  try {
    const client = new Client({ connectionString: testUrl.toString() });
    await client.connect();
    try {
      await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
    } finally {
      await client.end();
    }
  } catch (error) {
    await dropDatabase();
    throw error;
  }

  project.provide("databaseUrl", testUrl.toString());
  return dropDatabase;
}

async function runOnServer(serverUrl: string, statement: string): Promise<void> {
  const client = new Client({ connectionString: serverUrl });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`Can't reach Postgres for integration tests. Is it running? Try \`pnpm db:up\`.`, {
      cause: error,
    });
  }
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}
