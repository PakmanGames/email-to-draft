/**
 * Inserts the review fixtures from src/lib/contracts/fixtures.ts as extraction rows in the
 * database from DATABASE_URL, so /review/<id> can be checked in a browser before extraction
 * (T2) lands. Also adds one failed extraction with no result, as "Continue manually" leaves it.
 *
 *   pnpm exec tsx --env-file-if-exists=.env scripts/seed-review-fixtures.ts
 *
 * IDs are fixed, so rerunning updates the same rows and the printed URLs stay the same.
 */
import { sql } from "drizzle-orm";
import { reviewFixtures } from "@/lib/contracts/fixtures";
import { db } from "@/lib/db/client";
import { extraction } from "@/lib/db/schema";

const rows: (typeof extraction.$inferInsert)[] = [
  ...Object.values(reviewFixtures).map((fixture, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    emailText: fixture.emailText,
    status: fixture.seed.lines.length > 0 ? ("succeeded" as const) : ("no_items" as const),
    model: "fixture",
    promptVersion: "fixture",
    result: fixture.seed,
  })),
  {
    id: "00000000-0000-4000-8000-000000000009",
    emailText: reviewFixtures.cleanEmail.emailText,
    status: "failed",
    errorCode: "TIMEOUT",
    model: "fixture",
    promptVersion: "fixture",
    result: null,
  },
];

const names = [...Object.keys(reviewFixtures), "failedExtraction"];

async function main() {
  await db
    .insert(extraction)
    .values(rows)
    .onConflictDoUpdate({
      target: extraction.id,
      set: {
        emailText: sql`excluded.email_text`,
        status: sql`excluded.status`,
        errorCode: sql`excluded.error_code`,
        result: sql`excluded.result`,
      },
    });
  rows.forEach((row, i) => console.log(`${names[i].padEnd(18)} http://localhost:3000/review/${row.id}`));
}

main().finally(() => db.$client.end());
