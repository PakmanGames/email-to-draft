import { z } from "zod";
import { SaveQuoteConflict, SaveQuoteResponse, type SaveQuoteRequest } from "@/lib/contracts";

/**
 * The 400 (invalid body) and 404 (unknown extraction) bodies of POST /api/quotes. Not in the
 * contracts yet (KI-002), so it is described here.
 */
const SaveQuoteError = z.object({ error: z.string() });

export type SaveOutcome =
  | { kind: "created"; quoteId: string }
  | { kind: "alreadySaved"; quoteId: string }
  /** 0-based positions of lines whose offer is gone from inventory. */
  | { kind: "offerMissing"; linePositions: number[] }
  /** 400: the server rejected the body. Sending it again gets the same answer. */
  | { kind: "rejected"; message: string }
  /** 404: the extraction is gone, so this review can never be saved. */
  | { kind: "extractionMissing" }
  /** Anything else: network failure, server error, or a body that breaks the contract. */
  | { kind: "failed"; httpStatus: number | null };

/**
 * POST /api/quotes (technical design 5.6). Never throws, so every failure leaves the rep on
 * the review screen with their edits and a Retry.
 */
export async function postQuote(request: SaveQuoteRequest): Promise<SaveOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { kind: "failed", httpStatus: null };
  }
  const body: unknown = await res.json().catch(() => null);

  if (res.ok) {
    const created = SaveQuoteResponse.safeParse(body);
    if (created.success) return { kind: "created", quoteId: created.data.quoteId };
  } else if (res.status === 409) {
    const conflict = SaveQuoteConflict.safeParse(body);
    if (conflict.success) {
      return conflict.data.code === "ALREADY_SAVED"
        ? { kind: "alreadySaved", quoteId: conflict.data.quoteId }
        : { kind: "offerMissing", linePositions: conflict.data.linePositions };
    }
  } else if (res.status === 400 || res.status === 404) {
    const error = SaveQuoteError.safeParse(body);
    if (error.success) {
      return res.status === 400 ? { kind: "rejected", message: error.data.error } : { kind: "extractionMissing" };
    }
  }
  return { kind: "failed", httpStatus: res.status };
}
