import { asc, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { offer, part } from "@/lib/db/schema";
import { setupTestDb } from "@/test/db";
import { replaceInventory } from "./load";
import { parseInventoryCsv } from "./parse";

const db = setupTestDb();

const HEADER = "part_number,nsn,description,supplier,qty_on_hand,unit_cost,lead_time_days";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n") + "\n";
const load = async (text: string) => replaceInventory(db, parseInventoryCsv(text));

// Real rows from mock_data/shared/inventory.csv.
const GOOD = csv(
  'GS9174A,5905-01-520-3335,"RESISTOR,FIXED,FILM 4.7K OHM 1/4W",Continental Hose Co,8,1.68,7',
  'GS9174A,5905-01-520-3335,"RESISTOR,FIXED,FILM 4.7K OHM 1/4W",Lakeshore Precision,13,1.30,21',
  'MS29513-037,,"SEAL,NONMETALLIC SPECIAL SHAPED SECTION AS568-012",Ridgeline MRO Supply,0,1.16,70',
);

async function snapshot() {
  const parts = await db.select().from(part).orderBy(asc(part.partNumber));
  const offers = await db.select().from(offer).orderBy(asc(offer.partNumber), asc(offer.supplier));
  return { parts, offers };
}

describe("replaceInventory", () => {
  it("loads parts and offers and reports the counts stored", async () => {
    expect(await load(GOOD)).toEqual({ parts: 2, offers: 3 });
  });

  it("stores a blank NSN as NULL, qty 0 as 0, and unit_cost exactly", async () => {
    await load(GOOD);
    const [{ nullNsns, emptyNsns }] = (
      await db.execute<{ nullNsns: number; emptyNsns: number }>(
        sql`SELECT count(*) FILTER (WHERE nsn IS NULL)::int AS "nullNsns", count(*) FILTER (WHERE nsn = '')::int AS "emptyNsns" FROM part`,
      )
    ).rows;
    expect({ nullNsns, emptyNsns }).toEqual({ nullNsns: 1, emptyNsns: 0 });

    const { parts, offers } = await snapshot();
    expect(parts[1]).toMatchObject({ partNumber: "MS29513-037", partNumberKey: "MS29513037", nsn: null });
    expect(offers.map((o) => [o.supplier, o.qtyOnHand, o.unitCost])).toEqual([
      ["Continental Hose Co", 8, "1.68"],
      ["Lakeshore Precision", 13, "1.30"],
      ["Ridgeline MRO Supply", 0, "1.16"],
    ]);
  });

  it("gives the same result when rerun", async () => {
    await load(GOOD);
    const first = await snapshot();
    expect(await load(GOOD)).toEqual({ parts: 2, offers: 3 });
    expect(await snapshot()).toEqual(first);
  });

  it("replaces the previous inventory instead of merging into it", async () => {
    await load(GOOD);
    await load(csv('AN3-9D,5310-21-016-3476,"NUT,SELF-LOCKING,CLINCH 5/16-24 UNF",Tri-County Fastener,8,1.45,180'));
    const { parts, offers } = await snapshot();
    expect(parts.map((p) => p.partNumber)).toEqual(["AN3-9D"]);
    expect(offers).toHaveLength(1);
  });

  it("loads in batches when there are more rows than one insert holds", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => `P-${i},,PART ${i},Supplier ${i % 3},${i},1.00,${i % 30}`);
    expect(await load(csv(...rows))).toEqual({ parts: 2500, offers: 2500 });
  });

  it.each([
    ["a negative quantity", "AN3-9D,,NUT,Tri-County Fastener,-3,1.45,180", 'Line 2: qty_on_hand "-3" is not a whole number 0 or greater'],
    ["a malformed NSN", "AN3-9D,5310210163476,NUT,Tri-County Fastener,8,1.45,180", 'Line 2: nsn "5310210163476" is not in ####-##-###-#### format'],
    [
      "a duplicate (part, supplier) pair",
      "AN3-9D,,NUT,Tri-County Fastener,8,1.45,180\nAN3-9D,,NUT,Tri-County Fastener,9,1.40,30",
      'Line 3: part AN3-9D from supplier "Tri-County Fastener" is already on line 2',
    ],
    [
      "conflicting descriptions for one part",
      "AN3-9D,,NUT,Tri-County Fastener,8,1.45,180\nAN3-9D,,BOLT,Copperline Electronics,9,1.89,14",
      'Line 3: part AN3-9D has description "BOLT" here but "NUT" on line 2',
    ],
  ])("fails on %s with a clear message and leaves the previous data intact", async (_label, rows, message) => {
    await load(GOOD);
    const before = await snapshot();

    await expect(load(csv(rows))).rejects.toThrow(message);

    expect(await snapshot()).toEqual(before);
  });

  it("rolls back everything when the database rejects a row partway through", async () => {
    await load(GOOD);
    const before = await snapshot();
    const inventory = parseInventoryCsv(csv("AN3-9D,,NUT,Tri-County Fastener,8,1.45,180"));
    // Bypass the parser: an offer for a part that isn't loaded fails the foreign key after
    // the old rows were already deleted and the new part inserted.
    inventory.offers.push({ partNumber: "NOT-LOADED", supplier: "Acme", qtyOnHand: 1, unitCostCents: 100, leadTimeDays: 0 });

    await expect(replaceInventory(db, inventory)).rejects.toThrow();

    expect(await snapshot()).toEqual(before);
  });
});
