import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { offer, part, quote, quoteLine } from "@/lib/db/schema";
import { setupTestDb } from "@/test/db";
import { ExtractionNotFoundError, getQuote, listQuotes, OfferMissingError, saveQuote } from ".";
import { insertExtraction, insertInventory, matchedLine, unmatchedLine } from "./test-fixtures";

const db = setupTestDb();

beforeEach(() => insertInventory(db));

function linesOf(quoteId: string) {
  return db.select().from(quoteLine).where(eq(quoteLine.quoteId, quoteId)).orderBy(asc(quoteLine.position));
}

function offers() {
  return db.select().from(offer).orderBy(asc(offer.partNumber), asc(offer.supplier));
}

describe("saveQuote", () => {
  it("prices matched lines from inventory cost and markup, and snapshots the offer", async () => {
    const extractionId = await insertExtraction(db);

    const { quoteId, created } = await saveQuote({
      extractionId,
      markupBps: 2500,
      lines: [
        matchedLine("MS9556-82", "Eagle Rock Electronics", 10),
        matchedLine("96F62405-7", "Bay Aero Components", 4),
      ],
    });

    expect(created).toBe(true);
    const lines = await linesOf(quoteId);
    expect(lines[0]).toMatchObject({
      position: 0,
      partNumber: "MS9556-82",
      description: "NUT,SELF-LOCKING,CLINCH #4-40 UNC",
      supplier: "Eagle Rock Electronics",
      unitCostCents: 34,
      unitPriceCents: 43, // 42.5 rounds half up
      qtyOnHand: 18,
      leadTimeDays: 7,
    });
    expect(lines[1]).toMatchObject({
      position: 1,
      partNumber: "96F62405-7",
      description: "UNION,TUBE TITANIUM",
      supplier: "Bay Aero Components",
      unitCostCents: 1833,
      unitPriceCents: 2291, // 2291.25 rounds down
      qtyOnHand: 59,
      leadTimeDays: 35,
    });
  });

  it("keeps the rep's line fields as sent", async () => {
    const extractionId = await insertExtraction(db);
    const manual = {
      ...matchedLine("96F62405-7", "Lakeshore Precision", 3),
      origin: "manual" as const,
      edited: true,
      requestedText: "Customer called: add 3 titanium unions",
      matchConfidence: null,
      matchReason: null,
      suggestedPartNumber: null,
    };

    const { quoteId } = await saveQuote({ extractionId, markupBps: 2500, lines: [manual] });

    const [line] = await linesOf(quoteId);
    expect(line).toMatchObject({
      origin: "manual",
      edited: true,
      requestedText: "Customer called: add 3 titanium unions",
      quantity: 3,
      matchConfidence: null,
      matchReason: null,
      suggestedPartNumber: null,
    });
  });

  it.each([
    [0, 34, 1833], // 0% sells at cost
    [1250, 38, 2062], // 38.25 and 2062.125 round down
    [100_000, 374, 20163], // 1000%, the maximum
  ])("prices at %i bps from cost", async (markupBps, eagleRockPrice, bayAeroPrice) => {
    const extractionId = await insertExtraction(db);

    const { quoteId } = await saveQuote({
      extractionId,
      markupBps,
      lines: [
        matchedLine("MS9556-82", "Eagle Rock Electronics", 1),
        matchedLine("96F62405-7", "Bay Aero Components", 1),
      ],
    });

    const lines = await linesOf(quoteId);
    expect(lines.map((line) => line.unitPriceCents)).toEqual([eagleRockPrice, bayAeroPrice]);
    const [saved] = await db.select().from(quote).where(eq(quote.id, quoteId));
    expect(saved.markupBps).toBe(markupBps);
  });

  it("totals the stored line prices and leaves unmatched lines out of the total", async () => {
    const extractionId = await insertExtraction(db);

    const { quoteId } = await saveQuote({
      extractionId,
      markupBps: 2500,
      lines: [
        matchedLine("MS9556-82", "Eagle Rock Electronics", 10),
        unmatchedLine("ZX-4471-B hydraulic coupler, qty 2", 2),
        matchedLine("96F62405-7", "Bay Aero Components", 4),
      ],
    });

    const [saved] = await db.select().from(quote).where(eq(quote.id, quoteId));
    const lines = await linesOf(quoteId);
    const lineTotal = lines.reduce((sum, line) => sum + (line.unitPriceCents ?? 0) * line.quantity, 0);
    expect(saved.totalCents).toBe(43 * 10 + 2291 * 4);
    expect(saved.totalCents).toBe(lineTotal);
  });

  it("saves unmatched lines unpriced", async () => {
    const extractionId = await insertExtraction(db);

    const { quoteId } = await saveQuote({
      extractionId,
      markupBps: 2500,
      lines: [unmatchedLine("ZX-4471-B hydraulic coupler, qty 2", 2)],
    });

    const [line] = await linesOf(quoteId);
    expect(line).toMatchObject({
      requestedText: "ZX-4471-B hydraulic coupler, qty 2",
      quantity: 2,
      matchConfidence: "none",
      partNumber: null,
      description: null,
      supplier: null,
      unitCostCents: null,
      unitPriceCents: null,
      qtyOnHand: null,
      leadTimeDays: null,
    });
    const [saved] = await db.select().from(quote).where(eq(quote.id, quoteId));
    expect(saved.totalCents).toBe(0);
  });

  it("creates one draft per extraction, and saving again returns the existing one", async () => {
    const extractionId = await insertExtraction(db);
    const first = await saveQuote({
      extractionId,
      markupBps: 2500,
      lines: [matchedLine("MS9556-82", "Eagle Rock Electronics", 10)],
    });

    // A retry from another tab with different edits still changes nothing.
    const second = await saveQuote({
      extractionId,
      markupBps: 0,
      lines: [unmatchedLine("something else", 1), unmatchedLine("and more", 2)],
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({ quoteId: first.quoteId, created: false });
    expect(await db.$count(quote)).toBe(1);
    const [saved] = await db.select().from(quote);
    expect(saved.markupBps).toBe(2500);
    expect(await linesOf(first.quoteId)).toHaveLength(1);
  });

  it("creates one draft when the same extraction is saved concurrently", async () => {
    const extractionId = await insertExtraction(db);
    const request = {
      extractionId,
      markupBps: 2500,
      lines: [matchedLine("MS9556-82", "Eagle Rock Electronics", 10)],
    };

    const results = await Promise.all([saveQuote(request), saveQuote(request), saveQuote(request)]);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.quoteId)).size).toBe(1);
    expect(await db.$count(quote)).toBe(1);
    expect(await db.$count(quoteLine)).toBe(1);
  });

  it("rejects lines whose offer is gone, with their positions, and saves nothing", async () => {
    const extractionId = await insertExtraction(db);

    const save = saveQuote({
      extractionId,
      markupBps: 2500,
      lines: [
        matchedLine("MS9556-82", "Eagle Rock Electronics", 10),
        matchedLine("MS9556-82", "Supplier That Left", 10),
        unmatchedLine("ZX-4471-B hydraulic coupler, qty 2", 2),
        matchedLine("NOT-A-PART", "Bay Aero Components", 1),
      ],
    });

    const error = await save.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OfferMissingError);
    expect((error as OfferMissingError).linePositions).toEqual([1, 3]);
    expect(await db.$count(quote)).toBe(0);
    expect(await db.$count(quoteLine)).toBe(0);
  });

  it("fails when the extraction does not exist", async () => {
    const save = saveQuote({
      extractionId: "7d1e5a6c-3a51-4b8e-9a43-2f0f5b6c1d20",
      markupBps: 2500,
      lines: [unmatchedLine("anything", 1)],
    });

    await expect(save).rejects.toBeInstanceOf(ExtractionNotFoundError);
    expect(await db.$count(quote)).toBe(0);
  });

  it("never changes stock", async () => {
    const before = await offers();

    await saveQuote({
      extractionId: await insertExtraction(db),
      markupBps: 2500,
      lines: [
        matchedLine("MS9556-82", "Eagle Rock Electronics", 10),
        matchedLine("96F62405-7", "Bay Aero Components", 500),
      ],
    });

    expect(await offers()).toEqual(before);
  });

  it("lets two drafts from different extractions each quote the full on-hand quantity of one offer", async () => {
    const line = matchedLine("96F62405-7", "Bay Aero Components", 59);

    const first = await saveQuote({ extractionId: await insertExtraction(db), markupBps: 2500, lines: [line] });
    const second = await saveQuote({ extractionId: await insertExtraction(db), markupBps: 2500, lines: [line] });

    expect(first.created && second.created).toBe(true);
    expect(first.quoteId).not.toBe(second.quoteId);
    for (const { quoteId } of [first, second]) {
      const [saved] = await linesOf(quoteId);
      expect(saved).toMatchObject({ quantity: 59, qtyOnHand: 59 });
    }
    const [bayAero] = await db.select().from(offer).where(eq(offer.supplier, "Bay Aero Components"));
    expect(bayAero.qtyOnHand).toBe(59);
  });
});

describe("listQuotes", () => {
  it("lists drafts newest first with line, unmatched, and short-stock counts", async () => {
    const older = await saveQuote({
      extractionId: await insertExtraction(db),
      markupBps: 2500,
      lines: [
        matchedLine("MS9556-82", "Eagle Rock Electronics", 18), // exactly on hand: not short
        matchedLine("96F62405-7", "Lakeshore Precision", 20), // 11 on hand: short
        unmatchedLine("ZX-4471-B hydraulic coupler, qty 2", 2),
      ],
    });
    const newer = await saveQuote({
      extractionId: await insertExtraction(db),
      markupBps: 1250,
      lines: [matchedLine("MS29513-037", "Ridgeline MRO Supply", 5)], // 0 on hand: short
    });
    const empty = await saveQuote({ extractionId: await insertExtraction(db), markupBps: 0, lines: [] });

    const summaries = await listQuotes();

    expect(summaries.map((summary) => summary.id)).toEqual([empty.quoteId, newer.quoteId, older.quoteId]);
    expect(summaries[0]).toMatchObject({ lineCount: 0, unmatchedCount: 0, shortStockCount: 0, totalCents: 0 });
    expect(summaries[1]).toMatchObject({
      lineCount: 1,
      unmatchedCount: 0,
      shortStockCount: 1,
      markupBps: 1250,
      totalCents: 131 * 5, // 116 at 12.5% is 130.5, half up
    });
    expect(summaries[2]).toMatchObject({
      lineCount: 3,
      unmatchedCount: 1,
      shortStockCount: 1,
      markupBps: 2500,
      totalCents: 43 * 18 + 1849 * 20,
    });
    expect(summaries[2].createdAt).toBeInstanceOf(Date);
  });

  it("returns an empty list when nothing is saved", async () => {
    expect(await listQuotes()).toEqual([]);
  });
});

describe("getQuote", () => {
  it("returns the draft with its lines in position order", async () => {
    const extractionId = await insertExtraction(db);
    const { quoteId } = await saveQuote({
      extractionId,
      markupBps: 2500,
      lines: [
        unmatchedLine("ZX-4471-B hydraulic coupler, qty 2", 2),
        matchedLine("96F62405-7", "Bay Aero Components", 4),
      ],
    });

    const detail = await getQuote(quoteId);

    expect(detail).toEqual({
      id: quoteId,
      createdAt: expect.any(Date),
      extractionId,
      markupBps: 2500,
      totalCents: 2291 * 4,
      lines: [
        {
          position: 0,
          origin: "extracted",
          edited: false,
          requestedText: "ZX-4471-B hydraulic coupler, qty 2",
          quantity: 2,
          matchConfidence: "none",
          matchReason: "Not in inventory",
          suggestedPartNumber: null,
          partNumber: null,
          description: null,
          supplier: null,
          unitCostCents: null,
          unitPriceCents: null,
          qtyOnHand: null,
          leadTimeDays: null,
        },
        {
          position: 1,
          origin: "extracted",
          edited: false,
          requestedText: "96F62405-7 qty 4",
          quantity: 4,
          matchConfidence: "high",
          matchReason: "Exact part number match",
          suggestedPartNumber: "96F62405-7",
          partNumber: "96F62405-7",
          description: "UNION,TUBE TITANIUM",
          supplier: "Bay Aero Components",
          unitCostCents: 1833,
          unitPriceCents: 2291,
          qtyOnHand: 59,
          leadTimeDays: 35,
        },
      ],
    });
  });

  it("keeps showing saved values after inventory is reloaded", async () => {
    const { quoteId } = await saveQuote({
      extractionId: await insertExtraction(db),
      markupBps: 2500,
      lines: [matchedLine("96F62405-7", "Bay Aero Components", 4)],
    });

    // What the inventory loader does: replace every offer and part.
    await db.delete(offer);
    await db.delete(part);

    const detail = await getQuote(quoteId);
    expect(detail?.lines[0]).toMatchObject({ partNumber: "96F62405-7", unitCostCents: 1833, unitPriceCents: 2291 });
  });

  it.each([
    ["an unknown ID", "7d1e5a6c-3a51-4b8e-9a43-2f0f5b6c1d20"],
    ["a malformed ID", "not-a-uuid"],
  ])("returns null for %s", async (_label, id) => {
    expect(await getQuote(id)).toBeNull();
  });
});
