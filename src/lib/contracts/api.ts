import { z } from "zod";
import { ExtractionErrorCode } from "./extraction";
import { Candidate } from "./matching";

// Technical design 5.6: HTTP request and response bodies. `SaveQuoteRequest` lives in quote.ts.

/** Longest email the paste page accepts and the server will send to the model (EXT-1). */
export const MAX_EMAIL_CHARS = 20_000;

/**
 * Body of POST /api/extractions. Deliberately loose: the route checks trimmed,
 * non-empty, and length itself so it can answer EMPTY_INPUT or INPUT_TOO_LARGE.
 */
export const CreateExtractionRequest = z.strictObject({ emailText: z.string() });
export type CreateExtractionRequest = z.infer<typeof CreateExtractionRequest>;

export const ExtractionError = z.strictObject({
  code: ExtractionErrorCode,
  message: z.string(),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().nullable(),
});
export type ExtractionError = z.infer<typeof ExtractionError>;

/**
 * 200 with `ok: true`, or 4xx/5xx with `ok: false`. `extractionId` is non-null for every
 * failure after input validation, so "Continue manually" can always open the review page.
 * The one exception is an `INTERNAL_ERROR` that stopped the extraction row being written.
 */
export const CreateExtractionResponse = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    extractionId: z.uuid(),
    status: z.enum(["succeeded", "no_items"]),
  }),
  z.strictObject({
    ok: z.literal(false),
    extractionId: z.uuid().nullable(),
    error: ExtractionError,
  }),
]);
export type CreateExtractionResponse = z.infer<typeof CreateExtractionResponse>;

/** 200 body of GET /api/parts?q= */
export const SearchPartsResponse = z.strictObject({ candidates: z.array(Candidate) });
export type SearchPartsResponse = z.infer<typeof SearchPartsResponse>;

/** 201 body of POST /api/quotes. */
export const SaveQuoteResponse = z.strictObject({ quoteId: z.uuid() });
export type SaveQuoteResponse = z.infer<typeof SaveQuoteResponse>;

/**
 * 409 body of POST /api/quotes: this extraction already has a draft, or some lines'
 * offers no longer exist in inventory.
 */
export const SaveQuoteConflict = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("ALREADY_SAVED"), quoteId: z.uuid() }),
  z.strictObject({
    code: z.literal("OFFER_MISSING"),
    linePositions: z.array(z.number().int().nonnegative()),
  }),
]);
export type SaveQuoteConflict = z.infer<typeof SaveQuoteConflict>;
