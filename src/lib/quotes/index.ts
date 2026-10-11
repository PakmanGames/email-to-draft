/**
 * Saving and reading draft quotes (technical design 9).
 *
 * Prices never come from the client: `saveQuote` re-prices every matched line from the
 * offer's cost and the draft's markup, then snapshots the offer onto the line, so a saved
 * draft never changes when inventory is reloaded.
 */
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { SaveQuoteRequest, type QuoteDetail, type QuoteSummary } from "@/lib/contracts";
import { db } from "@/lib/db/client";
import { extraction, offer, part, quote, quoteLine } from "@/lib/db/schema";
import { unitPriceCents } from "@/lib/pricing";

/**
 * `SaveQuoteRequest` plus the one rule its shape can't state: a line names both a part
 * and a supplier (priced from that offer) or neither (unmatched). POST /api/quotes
 * validates with this, so a half-matched line is a 400 rather than a constraint error.
 */
export const SaveQuoteBody = SaveQuoteRequest.superRefine((req, ctx) => {
  req.lines.forEach((line, position) => {
    if ((line.partNumber === null) !== (line.supplier === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["lines", position],
        message: "partNumber and supplier must both be set or both be null",
      });
    }
  });
});

/** Some matched lines name an offer that is no longer in inventory. Nothing was saved. */
export class OfferMissingError extends Error {
  constructor(readonly linePositions: number[]) {
    super(`No offer in inventory for lines at positions ${linePositions.join(", ")}`);
    this.name = "OfferMissingError";
  }
}

/** The request's extraction does not exist, so there is no trace to attach the draft to. */
export class ExtractionNotFoundError extends Error {
  constructor(readonly extractionId: string) {
    super(`Extraction ${extractionId} does not exist`);
    this.name = "ExtractionNotFoundError";
  }
}

/**
 * Prices every line from inventory and saves the draft in one transaction. One draft per
 * `req.extractionId`: if it already has one, nothing is written and `created` is false.
 * Line positions are indexes into `req.lines`.
 *
 * @throws {OfferMissingError} when a matched line's (partNumber, supplier) offer is gone.
 * @throws {ExtractionNotFoundError} when the extraction does not exist.
 */
export async function saveQuote(req: SaveQuoteRequest): Promise<{ quoteId: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const [trace] = await tx
      .select({ id: extraction.id })
      .from(extraction)
      .where(eq(extraction.id, req.extractionId));
    if (!trace) throw new ExtractionNotFoundError(req.extractionId);

    const matched = req.lines.filter(
      (line): line is typeof line & { partNumber: string; supplier: string } =>
        line.partNumber !== null && line.supplier !== null,
    );
    const offers = new Map<string, OfferSnapshot>();
    if (matched.length > 0) {
      const rows = await tx
        .select({
          partNumber: offer.partNumber,
          supplier: offer.supplier,
          description: part.description,
          // numeric(12,2) to integer cents in Postgres, so no float ever touches money.
          unitCostCents: sql<number>`(${offer.unitCost} * 100)::integer`,
          qtyOnHand: offer.qtyOnHand,
          leadTimeDays: offer.leadTimeDays,
        })
        .from(offer)
        .innerJoin(part, eq(part.partNumber, offer.partNumber))
        .where(
          or(...matched.map((line) => and(eq(offer.partNumber, line.partNumber), eq(offer.supplier, line.supplier)))),
        );
      for (const row of rows) offers.set(offerKey(row.partNumber, row.supplier), row);
    }

    const missing: number[] = [];
    const lines = req.lines.map((line, position) => {
      const snapshot = {
        position,
        origin: line.origin,
        edited: line.edited,
        requestedText: line.requestedText,
        quantity: line.quantity,
        matchConfidence: line.matchConfidence,
        matchReason: line.matchReason,
        suggestedPartNumber: line.suggestedPartNumber,
      };
      if (line.partNumber === null || line.supplier === null) return { ...snapshot, unitPriceCents: null };

      const found = offers.get(offerKey(line.partNumber, line.supplier));
      if (!found) {
        missing.push(position);
        return { ...snapshot, unitPriceCents: null };
      }
      return {
        ...snapshot,
        ...found,
        unitPriceCents: unitPriceCents(found.unitCostCents, req.markupBps),
      };
    });
    if (missing.length > 0) throw new OfferMissingError(missing);

    // The total is derived from the same per-line prices that are stored, so they always agree.
    const totalCents = lines.reduce((sum, line) => sum + (line.unitPriceCents ?? 0) * line.quantity, 0);

    // The unique extraction_id makes Save idempotent. A concurrent save of the same
    // extraction waits on this insert, then sees the committed row and does nothing.
    const [created] = await tx
      .insert(quote)
      .values({ extractionId: req.extractionId, markupBps: req.markupBps, totalCents })
      .onConflictDoNothing({ target: quote.extractionId })
      .returning({ id: quote.id });
    if (!created) {
      const [existing] = await tx
        .select({ id: quote.id })
        .from(quote)
        .where(eq(quote.extractionId, req.extractionId));
      return { quoteId: existing.id, created: false };
    }

    if (lines.length > 0) {
      await tx.insert(quoteLine).values(lines.map((line) => ({ ...line, quoteId: created.id })));
    }
    return { quoteId: created.id, created: true };
  });
}

type OfferSnapshot = {
  partNumber: string;
  supplier: string;
  description: string;
  unitCostCents: number;
  qtyOnHand: number;
  leadTimeDays: number;
};

function offerKey(partNumber: string, supplier: string): string {
  return JSON.stringify([partNumber, supplier]);
}

/** Saved drafts, newest first. */
export async function listQuotes(): Promise<QuoteSummary[]> {
  // count(position) skips the all-NULL row LEFT JOIN produces for a draft with no lines.
  return db
    .select({
      id: quote.id,
      createdAt: quote.createdAt,
      lineCount: sql<number>`count(${quoteLine.position})::integer`,
      unmatchedCount: sql<number>`(count(${quoteLine.position}) FILTER (WHERE ${quoteLine.partNumber} IS NULL))::integer`,
      // Same rule as isShortStock() in ./short-stock.ts.
      shortStockCount: sql<number>`(count(${quoteLine.position}) FILTER (WHERE ${quoteLine.quantity} > ${quoteLine.qtyOnHand}))::integer`,
      markupBps: quote.markupBps,
      totalCents: quote.totalCents,
    })
    .from(quote)
    .leftJoin(quoteLine, eq(quoteLine.quoteId, quote.id))
    .groupBy(quote.id)
    .orderBy(desc(quote.createdAt), desc(quote.id));
}

/** A saved draft and its lines in position order, or null when there is no such draft. */
export async function getQuote(id: string): Promise<QuoteDetail | null> {
  // The ID comes from the URL. Postgres rejects a malformed uuid, so treat it as not found.
  if (!z.uuid().safeParse(id).success) return null;

  const [row] = await db
    .select({
      id: quote.id,
      createdAt: quote.createdAt,
      extractionId: quote.extractionId,
      markupBps: quote.markupBps,
      totalCents: quote.totalCents,
    })
    .from(quote)
    .where(eq(quote.id, id));
  if (!row) return null;

  const lines = await db
    .select({
      position: quoteLine.position,
      origin: quoteLine.origin,
      edited: quoteLine.edited,
      requestedText: quoteLine.requestedText,
      quantity: quoteLine.quantity,
      matchConfidence: quoteLine.matchConfidence,
      matchReason: quoteLine.matchReason,
      suggestedPartNumber: quoteLine.suggestedPartNumber,
      partNumber: quoteLine.partNumber,
      description: quoteLine.description,
      supplier: quoteLine.supplier,
      unitCostCents: quoteLine.unitCostCents,
      unitPriceCents: quoteLine.unitPriceCents,
      qtyOnHand: quoteLine.qtyOnHand,
      leadTimeDays: quoteLine.leadTimeDays,
    })
    .from(quoteLine)
    .where(eq(quoteLine.quoteId, id))
    .orderBy(quoteLine.position);

  return { ...row, lines };
}
