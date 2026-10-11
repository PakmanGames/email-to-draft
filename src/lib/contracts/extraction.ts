import { z } from "zod";
import { LineMatch } from "./matching";

/**
 * Technical design 5.1: the only shape the model is asked to produce.
 *
 * Groq strict mode needs every property required and `additionalProperties: false`,
 * so these use `z.strictObject` and `.nullable()`, never `.optional()`.
 * `z.toJSONSchema(LlmExtraction)` is what gets sent to the model.
 */
export const LlmLineItem = z.strictObject({
  source_text: z.string(), // the email text this item came from, copied verbatim
  part_number: z.string().nullable(), // as written
  nsn: z.string().nullable(), // as written, any format
  description: z.string().nullable(), // as written
  quantity: z.number().nullable(), // the number as written: "2 boxes of 100" -> 2
  unit: z.string().nullable(), // as written: "EA", "boxes", "PG", "HD", "dozen"
  pack_size: z.number().nullable(), // only when the email states it: "boxes of 100" -> 100
});
export type LlmLineItem = z.infer<typeof LlmLineItem>;

export const LlmExtraction = z.strictObject({
  line_items: z.array(LlmLineItem).max(100),
  no_items_reason: z.enum(["auto_reply", "attachment_only", "no_request", "other"]).nullable(),
  superseded_note: z.string().nullable(), // set when a later message in a chain replaces an earlier one
});
export type LlmExtraction = z.infer<typeof LlmExtraction>;

/**
 * What the server re-validates with after `JSON.parse` of the model output.
 *
 * Same shape as `LlmExtraction`, plus checks a JSON Schema sent to the model can't
 * reliably enforce. Kept separate so the model-facing schema stays strict-mode compatible.
 */
export const ValidatedLlmLineItem = LlmLineItem.extend({
  source_text: z.string().min(1).max(2000),
  part_number: z.string().max(100).nullable(),
  nsn: z.string().max(100).nullable(),
  description: z.string().max(500).nullable(),
  quantity: z.number().int().positive().nullable(),
  unit: z.string().max(50).nullable(),
  pack_size: z.number().int().positive().nullable(),
});

export const ValidatedLlmExtraction = LlmExtraction.extend({
  line_items: z.array(ValidatedLlmLineItem).max(100),
  superseded_note: z.string().max(1000).nullable(),
});

// Technical design 5.2: an extracted line after post-processing.

export const LineWarningCode = z.enum([
  "QTY_MISSING", // no quantity in the email
  "UNIT_UNKNOWN", // unit we can't convert to each; the rep must confirm
  "UNIT_CONVERTED", // informational: "2 boxes of 100 = 200 EA"
  "QTY_NOT_IN_TEXT", // quantity number not found in source_text
  "IDENTIFIER_DROPPED", // part number or NSN not found in the email, removed
  "NSN_INVALID", // NSN-like text that doesn't normalize to 13 digits
  "LINE_NOT_GROUNDED", // source_text not in the email, or its identifiers not in source_text
]);
export type LineWarningCode = z.infer<typeof LineWarningCode>;

export const LineWarning = z.strictObject({ code: LineWarningCode, message: z.string() });
export type LineWarning = z.infer<typeof LineWarning>;

export const ExtractedLine = z.strictObject({
  index: z.number().int().nonnegative(), // position in the model output
  sourceText: z.string(),
  partNumber: z.string().nullable(),
  nsn: z.string().nullable(), // normalized ####-##-###-#### or null
  description: z.string().nullable(),
  quantityEach: z.number().int().positive().nullable(),
  quantityAsWritten: z.string(), // "2 boxes of 100", for display
  warnings: z.array(LineWarning),
});
export type ExtractedLine = z.infer<typeof ExtractedLine>;

// Technical design 5.4: stored in `extraction.result`, rendered by the review page.

export const Notice = z.strictObject({
  code: z.enum(["NO_ITEMS", "LINES_DISCARDED", "SUPERSEDED", "EXTRACTION_FAILED"]),
  message: z.string(),
});
export type Notice = z.infer<typeof Notice>;

export const ReviewSeed = z.strictObject({
  lines: z.array(z.strictObject({ extracted: ExtractedLine, match: LineMatch })),
  notices: z.array(Notice),
});
export type ReviewSeed = z.infer<typeof ReviewSeed>;

// Technical design 5.5: stored in `extraction.attempts`.

export const ExtractionErrorCode = z.enum([
  "EMPTY_INPUT",
  "INPUT_TOO_LARGE",
  "TIMEOUT",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "MODEL_UNAVAILABLE",
  "INVALID_JSON",
  "SCHEMA_MISMATCH",
  "TRUNCATED",
  "CANCELLED",
]);
export type ExtractionErrorCode = z.infer<typeof ExtractionErrorCode>;

export const ExtractionAttempt = z.strictObject({
  startedAt: z.string(), // ISO timestamp
  durationMs: z.number().int(),
  httpStatus: z.number().int().nullable(),
  finishReason: z.string().nullable(),
  rawOutput: z.string().nullable(),
  errorCode: ExtractionErrorCode.nullable(),
  issues: z.array(z.string()), // zod issues or parse error, human readable
});
export type ExtractionAttempt = z.infer<typeof ExtractionAttempt>;

