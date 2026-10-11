import { SaveQuoteConflict, SaveQuoteResponse, type SaveQuoteRequest } from "@/lib/contracts";

export type SaveOutcome =
  | { kind: "created"; quoteId: string }
  | { kind: "alreadySaved"; quoteId: string }
  /** 0-based positions of lines whose offer is gone from inventory. */
  | { kind: "offerMissing"; linePositions: number[] }
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
  }
  return { kind: "failed", httpStatus: res.status };
}
