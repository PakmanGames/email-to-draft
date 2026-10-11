import { beforeEach, describe, expect, it } from "vitest";
import { type ExtractedLine, LineMatch } from "@/lib/contracts";
import { setupTestDb } from "@/test/db";
import { matchLines, searchParts } from ".";
import { seedTestInventory } from "./test-inventory";

const db = setupTestDb();
beforeEach(() => seedTestInventory(db));

function line(fields: Partial<ExtractedLine>): ExtractedLine {
  return {
    index: 0,
    sourceText: "",
    partNumber: null,
    nsn: null,
    description: null,
    quantityEach: 10,
    quantityAsWritten: "10",
    warnings: [],
    ...fields,
  };
}

async function matchOne(fields: Partial<ExtractedLine>): Promise<LineMatch> {
  const [match] = await matchLines([line(fields)]);
  return LineMatch.parse(match);
}

const partNumbers = (match: LineMatch) => match.candidates.map((c) => c.partNumber);

const NOT_GROUNDED = { code: "LINE_NOT_GROUNDED", message: "Couldn't find this part number in the line's text" } as const;

describe("matchLines: High", () => {
  it("matches an exact NSN", async () => {
    const match = await matchOne({ nsn: "5310-00-873-5749" });
    expect(match).toMatchObject({ confidence: "high", reason: "Exact NSN match", defaultPartNumber: "MS9556-82" });
    expect(match.candidates[0]).toMatchObject({ partNumber: "MS9556-82", kind: "nsn", score: 1 });
  });

  it("matches an exact part number", async () => {
    const match = await matchOne({ partNumber: "MS9556-82" });
    expect(match).toMatchObject({ confidence: "high", reason: "Exact part number match", defaultPartNumber: "MS9556-82" });
    expect(match.candidates[0]).toMatchObject({ kind: "part_number", score: 1 });
  });

  it("matches a part number written with different dashes, spaces, and case", async () => {
    const match = await matchOne({ partNumber: "ms 9556.82" });
    expect(match).toMatchObject({
      confidence: "high",
      reason: "Part number matches, ignoring dashes and case",
      defaultPartNumber: "MS9556-82",
    });
  });

  it("matches when the part number and NSN both point to the part", async () => {
    const match = await matchOne({ partNumber: "MS9556-82", nsn: "5310-00-873-5749" });
    expect(match).toMatchObject({ confidence: "high", reason: "Exact part number and NSN match" });
  });

  it("lets a part number pick one part out of a shared NSN", async () => {
    const match = await matchOne({ partNumber: "7170-9665-59", nsn: "5310-01-449-0355" });
    expect(match).toMatchObject({ confidence: "high", defaultPartNumber: "7170-9665-59" });
    expect(match.candidates.map((c) => [c.partNumber, c.reason])).toEqual([
      ["7170-9665-59", "Exact part number and NSN match"],
      ["NAS1291C333P", "NSN matches, but the part number doesn't"],
    ]);
  });

  it("accepts shorthand that agrees with the part's description", async () => {
    const match = await matchOne({ partNumber: "MS9556-82", description: "locknut" });
    expect(match.confidence).toBe("high");
  });

  it("preselects the default supplier and lists every offer in cents, cheapest first", async () => {
    const match = await matchOne({ partNumber: "MS9556-82", quantityEach: 10 });
    expect(match).toMatchObject({
      defaultSupplier: "Eagle Rock Electronics",
      defaultSupplierReason: "Cheapest supplier that can fill 10",
    });
    // The 0-on-hand offer is a routine fact, listed like any other (MAT-7).
    expect(match.candidates[0].offers).toEqual([
      { supplier: "Eagle Rock Electronics", qtyOnHand: 18, unitCostCents: 34, leadTimeDays: 7 },
      { supplier: "Riverside Precision Bolt", qtyOnHand: 9, unitCostCents: 36, leadTimeDays: 28 },
      { supplier: "Harbor Point Industrial", qtyOnHand: 0, unitCostCents: 37, leadTimeDays: 35 },
    ]);
  });
});

describe("matchLines: Low from an exact rule", () => {
  it("asks the rep to pick when an NSN covers several parts", async () => {
    const match = await matchOne({ nsn: "5310-01-449-0355" });
    expect(match).toMatchObject({
      confidence: "low",
      reason: "NSN 5310-01-449-0355 covers 2 part numbers. Pick one.",
      defaultPartNumber: null,
      defaultSupplier: null,
    });
    expect(partNumbers(match)).toEqual(["7170-9665-59", "NAS1291C333P"]);
  });

  it("asks the rep to pick when a part number matches several parts ignoring dashes", async () => {
    const match = await matchOne({ partNumber: "NAS6203852R" });
    expect(match).toMatchObject({
      confidence: "low",
      reason: "Part number matches 2 parts, ignoring dashes and case. Pick one.",
    });
    // The part spelled exactly as written comes first.
    expect(partNumbers(match)).toEqual(["NAS6203852R", "NAS6203-852R"]);
  });

  it("flags a part number and NSN that point to different parts", async () => {
    const match = await matchOne({ partNumber: "AN3-9D", nsn: "5310-00-873-5749" });
    expect(match).toMatchObject({ confidence: "low", reason: "Part number and NSN point to different parts" });
    expect(match.candidates.map((c) => [c.partNumber, c.kind])).toEqual([
      ["AN3-9D", "part_number"],
      ["MS9556-82", "nsn"],
    ]);
  });

  it("flags an NSN that matches while the part number is not in inventory", async () => {
    const match = await matchOne({ partNumber: "MS9556-83", nsn: "5310-00-873-5749" });
    expect(match).toMatchObject({ confidence: "low", reason: "NSN matches, but the part number doesn't" });
    expect(partNumbers(match)).toEqual(["MS9556-82"]);
  });

  it("flags a part number that matches while the NSN is not in inventory", async () => {
    const match = await matchOne({ partNumber: "MS9556-82", nsn: "5310-00-873-0000" });
    expect(match).toMatchObject({ confidence: "low", reason: "Part number matches, but the NSN doesn't" });
  });

  it("caps an exact match at Low when the line isn't grounded in its own text", async () => {
    const match = await matchOne({ partNumber: "MS9556-82", warnings: [NOT_GROUNDED] });
    expect(match).toMatchObject({
      confidence: "low",
      reason: "Couldn't confirm this part number belongs to this line",
      defaultPartNumber: null,
    });
    expect(match.candidates).toHaveLength(1);
    expect(match.candidates[0]).toMatchObject({ partNumber: "MS9556-82", kind: "part_number", score: 1 });
  });

  it("caps an exact match at Low when the description contradicts the part", async () => {
    const match = await matchOne({ partNumber: "MS9556-82", description: "o-ring" });
    expect(match).toMatchObject({ confidence: "low", reason: "Part number matches, but the description doesn't" });
    expect(partNumbers(match)).toEqual(["MS9556-82"]);
  });
});

describe("matchLines: fuzzy rules", () => {
  it("offers the closest part number for a 1-character typo", async () => {
    const match = await matchOne({ partNumber: "2437-308-66" });
    expect(match).toMatchObject({
      confidence: "low",
      reason: "No exact match. Closest part number differs by 1 character.",
      defaultPartNumber: null,
    });
    expect(match.candidates[0]).toMatchObject({
      partNumber: "2437-3308-66",
      kind: "part_number_fuzzy",
      reason: "Closest part number, differs by 1 character",
    });
    expect(match.candidates[0].score).toBeLessThan(1);
  });

  it("offers description candidates for a description-only line, best first", async () => {
    const match = await matchOne({ description: "-6 hose assemblies, 24 inch" });
    expect(match).toMatchObject({ confidence: "low", reason: "Matched on description only" });
    expect(partNumbers(match).slice(0, 2)).toEqual(["167-1343-05", "59M19353-9"]);
    for (const candidate of match.candidates) {
      expect(candidate).toMatchObject({ kind: "description_fuzzy", reason: "Similar description" });
    }
  });

  it("finds a spec number written as a part number in our descriptions", async () => {
    const match = await matchOne({ partNumber: "AS568-214", description: "o-rings" });
    expect(match).toMatchObject({
      confidence: "low",
      reason: "Part number not in inventory, matched on description only",
    });
    expect(partNumbers(match)).toEqual(["M83248/2-299"]);
  });

  it("doesn't search descriptions with a part number alone", async () => {
    // "QQ-1" scores 0.40 against "WASHER,LOCK 1/2-20 UNF" on its lone "1".
    expect((await matchOne({ partNumber: "QQ-1" })).confidence).toBe("none");
  });
});

describe("matchLines: None", () => {
  it("keeps a part number we don't carry as Not in inventory", async () => {
    const match = await matchOne({ partNumber: "HX-99812-ZZ" });
    expect(match).toEqual({
      confidence: "none",
      reason: "Not in inventory",
      candidates: [],
      defaultPartNumber: null,
      defaultSupplier: null,
      defaultSupplierReason: null,
    });
  });

  it("keeps an NSN we don't carry as Not in inventory", async () => {
    expect((await matchOne({ nsn: "5340-01-721-3154" })).confidence).toBe("none");
  });

  it("never matches a line without an NSN to a part whose NSN is NULL", async () => {
    // Two parts in the inventory have a NULL NSN. If NULL matched NULL, they would show up here.
    const known = await matchOne({ partNumber: "AN3-9D", nsn: null });
    expect(partNumbers(known)).toEqual(["AN3-9D"]);

    const unknown = await matchOne({ partNumber: "ZZ-404-ZZ", nsn: null });
    expect(unknown).toMatchObject({ confidence: "none", candidates: [] });
  });
});

describe("matchLines: batching", () => {
  it("returns one valid match per line, in the order given", async () => {
    const lines = [
      line({ partNumber: "HX-99812-ZZ" }),
      line({ description: "-6 hose assemblies, 24 inch" }),
      line({ partNumber: "2437-308-66" }),
      line({ nsn: "5310-00-873-5749" }),
      line({ partNumber: "MS9556-82", nsn: "5310-00-873-5749" }),
    ];
    const matches = await matchLines(lines);

    expect(matches.map((m) => LineMatch.parse(m).confidence)).toEqual(["none", "low", "low", "high", "high"]);
    expect(matches.map((m) => m.candidates[0]?.kind ?? null)).toEqual([
      null,
      "description_fuzzy",
      "part_number_fuzzy",
      "nsn",
      "part_number",
    ]);
  });

  it("returns nothing for no lines", async () => {
    expect(await matchLines([])).toEqual([]);
  });
});

describe("searchParts", () => {
  it("finds a part by part number, exact match first", async () => {
    const candidates = await searchParts("ms9556-82");
    expect(candidates[0]).toMatchObject({
      partNumber: "MS9556-82",
      kind: "part_number",
      reason: "Part number matches, ignoring dashes and case",
    });
  });

  it("finds a part by NSN written without dashes", async () => {
    const candidates = await searchParts("NSN 5310008735749");
    expect(candidates.map((c) => [c.partNumber, c.kind])).toEqual([["MS9556-82", "nsn"]]);
  });

  it("finds parts by description", async () => {
    const candidates = await searchParts("hose assembly -6 x 24");
    expect(candidates.map((c) => c.partNumber).slice(0, 2).sort()).toEqual(["167-1343-05", "59M19353-9"]);
    expect(candidates.every((c) => c.kind === "description_fuzzy")).toBe(true);
  });

  it("finds a mistyped part number", async () => {
    const candidates = await searchParts("2437-308-66");
    expect(candidates[0]).toMatchObject({ partNumber: "2437-3308-66", kind: "part_number_fuzzy" });
  });

  it("finds nothing for a blank query", async () => {
    expect(await searchParts("   ")).toEqual([]);
  });
});
