import { z } from "zod";
import { Confidence } from "./matching";

export const LineOrigin = z.enum(["extracted", "manual"]);
export type LineOrigin = z.infer<typeof LineOrigin>;

// Technical design 5.6: body of POST /api/quotes and the input to `saveQuote`.
export const SaveQuoteRequest = z.strictObject({
  quoteId: z.uuid(), // generated when the review page opens
  extractionId: z.uuid().nullable(),
  lines: z
    .array(
      z.strictObject({
        origin: LineOrigin,
        edited: z.boolean(),
        requestedText: z.string().min(1).max(2000),
        quantity: z.number().int().positive(),
        matchConfidence: Confidence.nullable(),
        matchReason: z.string().nullable(),
        // Both null for an unmatched line. No price field: the server prices from inventory.
        partNumber: z.string().nullable(),
        supplier: z.string().nullable(),
      }),
    )
    .max(200),
});
export type SaveQuoteRequest = z.infer<typeof SaveQuoteRequest>;

// Read side of a saved draft (technical design 5.7 and 9). Values are the snapshots in
// `quote_line`, never live inventory.

/** One row of the drafts list, newest first. */
export const QuoteSummary = z.strictObject({
  id: z.uuid(),
  createdAt: z.date(),
  lineCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
});
export type QuoteSummary = z.infer<typeof QuoteSummary>;

/** One `quote_line` row. Offer fields are all null for an unmatched line, or all set. */
export const QuoteLine = z.strictObject({
  position: z.number().int().nonnegative(),
  origin: LineOrigin,
  edited: z.boolean(),
  requestedText: z.string(),
  quantity: z.number().int().positive(),
  matchConfidence: Confidence.nullable(),
  matchReason: z.string().nullable(),
  partNumber: z.string().nullable(),
  description: z.string().nullable(),
  supplier: z.string().nullable(),
  unitPriceCents: z.number().int().positive().nullable(),
  qtyOnHand: z.number().int().nonnegative().nullable(),
  leadTimeDays: z.number().int().nonnegative().nullable(),
});
export type QuoteLine = z.infer<typeof QuoteLine>;

/** A saved draft for the read-only page, with a link back to its extraction trace. */
export const QuoteDetail = z.strictObject({
  id: z.uuid(),
  createdAt: z.date(),
  extractionId: z.uuid().nullable(),
  totalCents: z.number().int().nonnegative(),
  lines: z.array(QuoteLine),
});
export type QuoteDetail = z.infer<typeof QuoteDetail>;
