import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";

// `next dev` re-evaluates modules on every edit. Reuse one pool across reloads so they
// don't each open new connections. Only in development: tests end the pool per file.
const globalForDb = globalThis as unknown as { pgPool?: Pool };
const pool = globalForDb.pgPool ?? new Pool({ connectionString: env.DATABASE_URL });
if (process.env.NODE_ENV === "development") globalForDb.pgPool = pool;

/** The app's Drizzle client. In integration tests it points at the per-run test database. */
export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
