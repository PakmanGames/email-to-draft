import { z } from "zod";
import { Confidence } from "./matching";

export const LineOrigin = z.enum(["extracted", "manual"]);
export type LineOrigin = z.infer<typeof LineOrigin>;

/**
 * Largest quantity one draft line can hold, because `quote_line.quantity` is a Postgres
 * `integer`. Neither extraction nor the rep is otherwise bounded, so without this cap an
 * injected or misread quantity would fail the save with a 500 on every retry.
 */
export const MAX_LINE_QUANTITY = 2_147_483_647;

// Technical design 5.6: body of POST /api/quotes and the input to `saveQuote`.
export const SaveQuoteRequest = z.strictObject({
  extractionId: z.uuid(), // one draft per extraction
  markupBps: z.number().int().min(0).max(100000), // 2500 = 25%
  lines: z
    .array(
      z.strictObject({
        origin: LineOrigin,
        edited: z.boolean(),
        requestedText: z.string().min(1).max(2000),
        quantity: z.number().int().positive().max(MAX_LINE_QUANTITY),
        matchConfidence: Confidence.nullable(),
        matchReason: z.string().nullable(),
        suggestedPartNumber: z.string().nullable(), // what matching preselected, for metric G4
        // Both null for an unmatched line. No price field: the server prices from inventory cost and markupBps.
        partNumber: z.string().nullable(),
        supplier: z.string().nullable(),
      }),
    )
    .max(200),
});
export type SaveQuoteRequest = z.infer<typeof SaveQuoteRequest>;

// Read side of a saved draft (technical design 5.7 and 9). Values are the snapshots in
// `quote_line`, never live inventory.

/**
 * Display labels read from the draft's email by `summarizeEmail` (src/lib/email-summary.ts),
 * so a rep recognizes a draft. Untrusted plain text: always rendered as text, never as HTML.
 */
const EmailLabels = {
  customer: z.string().nullable(), // the sender's name from the email's From line
  subject: z.string().nullable(), // its Subject line, or its first non-empty line
};

/** One row of the drafts list, newest first. */
export const QuoteSummary = z.strictObject({
  id: z.uuid(),
  createdAt: z.date(),
  ...EmailLabels,
  lineCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  shortStockCount: z.number().int().nonnegative(), // lines where quantity > qtyOnHand
  markupBps: z.number().int().min(0).max(100000),
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
  suggestedPartNumber: z.string().nullable(),
  partNumber: z.string().nullable(),
  description: z.string().nullable(),
  supplier: z.string().nullable(),
  unitCostCents: z.number().int().positive().nullable(),
  unitPriceCents: z.number().int().positive().nullable(), // cost plus the draft's markup
  qtyOnHand: z.number().int().nonnegative().nullable(),
  leadTimeDays: z.number().int().nonnegative().nullable(),
});
export type QuoteLine = z.infer<typeof QuoteLine>;

/** A saved draft for the read-only page, with a link back to its extraction trace. */
export const QuoteDetail = z.strictObject({
  id: z.uuid(),
  createdAt: z.date(),
  ...EmailLabels,
  extractionId: z.uuid(),
  markupBps: z.number().int().min(0).max(100000),
  totalCents: z.number().int().nonnegative(),
  lines: z.array(QuoteLine),
});
export type QuoteDetail = z.infer<typeof QuoteDetail>;
