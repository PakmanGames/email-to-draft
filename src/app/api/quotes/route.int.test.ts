import { beforeEach, describe, expect, it } from "vitest";
import { SaveQuoteConflict, SaveQuoteResponse } from "@/lib/contracts";
import { quote, quoteLine } from "@/lib/db/schema";
import { insertExtraction, insertInventory, matchedLine, unmatchedLine } from "@/lib/quotes/test-fixtures";
import { setupTestDb } from "@/test/db";
import { POST } from "./route";

const db = setupTestDb();

beforeEach(() => insertInventory(db));

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function validBody() {
  return {
    extractionId: await insertExtraction(db),
    markupBps: 2500,
    lines: [
      matchedLine("MS9556-82", "Eagle Rock Electronics", 10),
      unmatchedLine("ZX-4471-B hydraulic coupler, qty 2", 2),
    ],
  };
}

describe("POST /api/quotes", () => {
  it("saves the draft and answers 201 with its ID", async () => {
    const response = await post(await validBody());

    expect(response.status).toBe(201);
    const { quoteId } = SaveQuoteResponse.parse(await response.json());
    const [saved] = await db.select().from(quote);
    expect(saved.id).toBe(quoteId);
  });

  it("answers 409 ALREADY_SAVED with the existing draft when the extraction is saved again", async () => {
    const body = await validBody();
    const first = SaveQuoteResponse.parse(await (await post(body)).json());

    const response = await post(body);

    expect(response.status).toBe(409);
    expect(SaveQuoteConflict.parse(await response.json())).toEqual({ code: "ALREADY_SAVED", quoteId: first.quoteId });
    expect(await db.$count(quote)).toBe(1);
  });

  it("answers 409 OFFER_MISSING with the positions of lines whose offer is gone", async () => {
    const body = await validBody();
    body.lines.push(matchedLine("96F62405-7", "Supplier That Left", 1));

    const response = await post(body);

    expect(response.status).toBe(409);
    expect(SaveQuoteConflict.parse(await response.json())).toEqual({ code: "OFFER_MISSING", linePositions: [2] });
    expect(await db.$count(quote)).toBe(0);
  });

  it.each([
    ["a unit price on a line", (body: Body) => ({ ...body, lines: [{ ...body.lines[0], unitPriceCents: 1 }] })],
    ["a unit cost on a line", (body: Body) => ({ ...body, lines: [{ ...body.lines[0], unitCostCents: 1 }] })],
    ["a draft total", (body: Body) => ({ ...body, totalCents: 1 })],
  ])("rejects a body with %s, so the client can't set prices", async (_label, withPrice) => {
    const response = await post(withPrice(await validBody()));

    expect(response.status).toBe(400);
    expect(await db.$count(quote)).toBe(0);
  });

  it.each([-1, 100_001, 2500.5])("rejects a markup of %d bps", async (markupBps) => {
    const response = await post({ ...(await validBody()), markupBps });

    expect(response.status).toBe(400);
    expect(await db.$count(quote)).toBe(0);
  });

  it.each([
    ["a part without a supplier", { partNumber: "MS9556-82", supplier: null }],
    ["a supplier without a part", { partNumber: null, supplier: "Eagle Rock Electronics" }],
  ])("rejects a line with %s", async (_label, pick) => {
    const body = await validBody();
    const response = await post({ ...body, lines: [{ ...body.lines[0], ...pick }] });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("partNumber and supplier must both be set or both be null");
    expect(await db.$count(quoteLine)).toBe(0);
  });

  it("rejects a body that isn't JSON", async () => {
    const response = await post("{not json");

    expect(response.status).toBe(400);
  });

  it("answers 404 when the extraction does not exist", async () => {
    const body = await validBody();

    const response = await post({ ...body, extractionId: "7d1e5a6c-3a51-4b8e-9a43-2f0f5b6c1d20" });

    expect(response.status).toBe(404);
    expect(await db.$count(quote)).toBe(0);
  });
});

type Body = Awaited<ReturnType<typeof validBody>>;
