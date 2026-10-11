// T0 stub with the final signatures (technical design 5.7). T5 replaces the bodies.
import type { QuoteDetail, QuoteSummary, SaveQuoteRequest } from "@/lib/contracts";
import { NotImplementedError } from "@/lib/not-implemented";

/** Prices every line from inventory and saves the draft. One draft per `req.extractionId`. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until T5 lands
export async function saveQuote(req: SaveQuoteRequest): Promise<{ quoteId: string; created: boolean }> {
  throw new NotImplementedError("saveQuote");
}

/** Saved drafts, newest first. */
export async function listQuotes(): Promise<QuoteSummary[]> {
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub until T5 lands
export async function getQuote(id: string): Promise<QuoteDetail | null> {
  return null;
}
