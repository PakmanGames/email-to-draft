import { describe, expect, it } from "vitest";
import { setupTestDb } from "@/test/db";
import { extraction, quote, quoteLine } from "./schema";

const db = setupTestDb();

async function newQuote(markupBps = 2500) {
  const [{ id: extractionId }] = await db
    .insert(extraction)
    .values({ emailText: "RFQ", status: "succeeded", model: "test", promptVersion: "test" })
    .returning({ id: extraction.id });
  const [{ id }] = await db.insert(quote).values({ extractionId, markupBps, totalCents: 0 }).returning({ id: quote.id });
  return id;
}

const unmatched = {
  position: 0,
  origin: "extracted" as const,
  edited: false,
  requestedText: "ZX-4471-B hydraulic coupler, qty 2",
  quantity: 2,
};
const priced = {
  ...unmatched,
  partNumber: "96F62405-7",
  supplier: "Bay Aero Components",
  unitCostCents: 1833,
  unitPriceCents: 2291,
  qtyOnHand: 59,
  leadTimeDays: 35,
};

/** The Postgres constraint a rejected insert violated. Drizzle wraps the pg error. */
async function violatedConstraint(insert: Promise<unknown>): Promise<string | undefined> {
  const error = await insert.then(
    () => undefined,
    (e: { cause?: { constraint?: string } }) => e,
  );
  return error?.cause?.constraint;
}

describe("quote_line constraints", () => {
  it("accepts a fully priced line and a fully unmatched line", async () => {
    const quoteId = await newQuote();
    await db.insert(quoteLine).values([
      { ...priced, quoteId },
      { ...unmatched, quoteId, position: 1 },
    ]);
    expect(await db.$count(quoteLine)).toBe(2);
  });

  it("rejects a line that is only partly priced", async () => {
    const quoteId = await newQuote();
    const insert = db.insert(quoteLine).values({ ...priced, quoteId, unitCostCents: null });
    expect(await violatedConstraint(insert)).toBe("quote_line_snapshot_check");
  });

  it("rejects a price below cost", async () => {
    const quoteId = await newQuote();
    const insert = db.insert(quoteLine).values({ ...priced, quoteId, unitPriceCents: 1832 });
    expect(await violatedConstraint(insert)).toBe("quote_line_price_not_below_cost_check");
  });
});

describe("quote constraints", () => {
  it.each([-1, 100_001])("rejects a markup of %i bps", async (markupBps) => {
    expect(await violatedConstraint(newQuote(markupBps))).toBe("quote_markup_bps_check");
  });

  it("allows one draft per extraction", async () => {
    await newQuote();
    const [{ extractionId }] = await db.select({ extractionId: quote.extractionId }).from(quote);
    const insert = db.insert(quote).values({ extractionId, markupBps: 0, totalCents: 0 });
    expect(await violatedConstraint(insert)).toBe("quote_extraction_id_key");
  });
});
