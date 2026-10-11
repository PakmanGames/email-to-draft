import { eq } from "drizzle-orm";
import { z } from "zod";
import { ReviewSeed } from "@/lib/contracts";
import { db } from "@/lib/db/client";
import { extraction } from "@/lib/db/schema";

export type LoadedReview = { emailText: string; seed: ReviewSeed };

/**
 * The email and review seed for one extraction, or null when there is no such extraction.
 *
 * A failed or unfinished extraction has no result, and "Continue manually" still lands here
 * (FAIL-5), so it gets zero lines and a notice. A stored result that no longer parses as a
 * ReviewSeed is treated the same way, so a bad row can never crash the review screen.
 */
export async function loadReview(extractionId: string): Promise<LoadedReview | null> {
  // Postgres rejects a malformed uuid with an error, so answer "not found" before querying.
  if (!z.uuid().safeParse(extractionId).success) return null;

  const [row] = await db
    .select({ emailText: extraction.emailText, status: extraction.status, result: extraction.result })
    .from(extraction)
    .where(eq(extraction.id, extractionId));
  if (!row) return null;

  const parsed = ReviewSeed.safeParse(row.result);
  if (parsed.success) return { emailText: row.emailText, seed: parsed.data };

  const message =
    row.status === "pending"
      ? "This extraction didn't finish, so no lines were filled in. Add them by hand below."
      : "Extraction failed, so no lines were filled in. Add them by hand below.";
  return { emailText: row.emailText, seed: { lines: [], notices: [{ code: "EXTRACTION_FAILED", message }] } };
}
