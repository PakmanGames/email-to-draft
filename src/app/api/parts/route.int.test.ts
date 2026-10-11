import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { SearchPartsResponse } from "@/lib/contracts";
import { seedTestInventory } from "@/lib/matching/test-inventory";
import { setupTestDb } from "@/test/db";
import { GET } from "./route";

const db = setupTestDb();
beforeEach(() => seedTestInventory(db));

async function search(query: string | null) {
  const url = new URL("http://localhost/api/parts");
  if (query !== null) url.searchParams.set("q", query);
  const response = await GET(new NextRequest(url));
  return { status: response.status, body: await response.json() };
}

async function candidatesFor(query: string) {
  const { status, body } = await search(query);
  expect(status).toBe(200);
  return SearchPartsResponse.parse(body).candidates;
}

describe("GET /api/parts", () => {
  it("returns candidates for a part number", async () => {
    const [first] = await candidatesFor("MS9556-82");
    expect(first).toMatchObject({ partNumber: "MS9556-82", kind: "part_number", reason: "Exact part number match" });
  });

  it("returns candidates for an NSN", async () => {
    const candidates = await candidatesFor("5310-01-449-0355");
    expect(candidates.map((c) => [c.partNumber, c.kind])).toEqual([
      ["7170-9665-59", "nsn"],
      ["NAS1291C333P", "nsn"],
    ]);
  });

  it("returns candidates for a description", async () => {
    const candidates = await candidatesFor("preformed packing AS568-214");
    expect(candidates[0]).toMatchObject({ partNumber: "M83248/2-299", kind: "description_fuzzy" });
  });

  it("returns no candidates for a missing or blank query", async () => {
    expect(await search(null)).toEqual({ status: 200, body: { candidates: [] } });
    expect(await search("  ")).toEqual({ status: 200, body: { candidates: [] } });
  });

  it("rejects a query over 200 characters", async () => {
    expect((await search("x".repeat(201))).status).toBe(400);
    expect((await search(` ${"x".repeat(200)} `)).status).toBe(200);
  });
});
