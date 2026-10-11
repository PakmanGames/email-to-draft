import { afterAll, inject } from "vitest";

// Runs before each integration test file's imports, so `@/lib/db/client` (and every
// module that uses it) connects to this run's test database, not the dev database.
process.env.DATABASE_URL = inject("databaseUrl");

afterAll(async () => {
  const { db } = await import("@/lib/db/client");
  await db.$client.end();
});
