import { describe, expect, it } from "vitest";
import { InventoryError, type InventoryProblem, parseInventoryCsv } from "./parse";

const HEADER = "part_number,nsn,description,supplier,qty_on_hand,unit_cost,lead_time_days";

/** A CSV with the header plus `rows`, one per line. */
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n") + "\n";

/** The problems `parseInventoryCsv` throws for `text`. Fails the test if it doesn't throw. */
function problemsFor(text: string): InventoryProblem[] {
  try {
    parseInventoryCsv(text);
  } catch (error) {
    if (error instanceof InventoryError) return error.problems;
    throw error;
  }
  throw new Error("expected parseInventoryCsv to throw");
}

// Real rows from mock_data/shared/inventory.csv.
const GS9174A_A = 'GS9174A,5905-01-520-3335,"RESISTOR,FIXED,FILM 4.7K OHM 1/4W",Continental Hose Co,8,1.68,7';
const GS9174A_B = 'GS9174A,5905-01-520-3335,"RESISTOR,FIXED,FILM 4.7K OHM 1/4W",Lakeshore Precision,13,1.30,21';
const MS29513_036 = 'MS29513-036,,"SEAL,NONMETALLIC SPECIAL SHAPED SECTION AS568-325",Silver Creek Supply Co,11,0.15,60';
const MS29513_037 = 'MS29513-037,,"SEAL,NONMETALLIC SPECIAL SHAPED SECTION AS568-012",Ridgeline MRO Supply,0,1.16,70';

describe("parseInventoryCsv", () => {
  it("groups rows into parts and offers, keeping quoted commas in descriptions", () => {
    const inventory = parseInventoryCsv(csv(GS9174A_A, GS9174A_B, MS29513_036));

    expect(inventory.parts).toEqual([
      { partNumber: "GS9174A", nsn: "5905-01-520-3335", description: "RESISTOR,FIXED,FILM 4.7K OHM 1/4W" },
      { partNumber: "MS29513-036", nsn: null, description: "SEAL,NONMETALLIC SPECIAL SHAPED SECTION AS568-325" },
    ]);
    expect(inventory.offers).toEqual([
      { partNumber: "GS9174A", supplier: "Continental Hose Co", qtyOnHand: 8, unitCostCents: 168, leadTimeDays: 7 },
      { partNumber: "GS9174A", supplier: "Lakeshore Precision", qtyOnHand: 13, unitCostCents: 130, leadTimeDays: 21 },
      { partNumber: "MS29513-036", supplier: "Silver Creek Supply Co", qtyOnHand: 11, unitCostCents: 15, leadTimeDays: 60 },
    ]);
  });

  it("keeps qty 0 as 0 and a blank NSN as null, never as missing or an empty string", () => {
    const { parts, offers } = parseInventoryCsv(csv(MS29513_037));
    expect(parts[0].nsn).toBeNull();
    expect(offers[0].qtyOnHand).toBe(0);
  });

  it.each([
    ["0.01", 1],
    ["1.30", 130],
    ["9382.34", 938234],
    ["0019.99", 1999],
    ["21474836.47", 2147483647], // the largest cost that fits in integer cents
  ])("converts unit_cost %s to %i cents exactly", (unitCost, cents) => {
    const { offers } = parseInventoryCsv(csv(`AN3-9D,,NUT,Tri-County Fastener,8,${unitCost},0`));
    expect(offers[0].unitCostCents).toBe(cents);
  });

  it("accepts CRLF line endings, a byte order mark, and a missing final newline", () => {
    const text = `﻿${HEADER}\r\n${GS9174A_A}\r\n${GS9174A_B}`;
    expect(parseInventoryCsv(text).offers).toHaveLength(2);
  });

  it.each([
    ["a negative quantity", "AN3-9D,,NUT,Acme,-3,1.45,0", 'qty_on_hand "-3" is not a whole number 0 or greater'],
    ["a decimal quantity", "AN3-9D,,NUT,Acme,2.5,1.45,0", 'qty_on_hand "2.5" is not a whole number 0 or greater'],
    ["a blank quantity", "AN3-9D,,NUT,Acme,,1.45,0", 'qty_on_hand "" is not a whole number 0 or greater'],
    ["a quantity too large for the database", "AN3-9D,,NUT,Acme,2147483648,1.45,0", 'qty_on_hand "2147483648" is too large'],
    ["an NSN without dashes", "AN3-9D,5310210163476,NUT,Acme,8,1.45,0", 'nsn "5310210163476" is not in ####-##-###-#### format'],
    ["an NSN with a prefix", "AN3-9D,NSN 5310-21-016-3476,NUT,Acme,8,1.45,0", 'nsn "NSN 5310-21-016-3476" is not in ####-##-###-#### format'],
    ["an NSN of spaces", "AN3-9D,  ,NUT,Acme,8,1.45,0", 'nsn "  " is not in ####-##-###-#### format'],
    ["a zero cost", "AN3-9D,,NUT,Acme,8,0.00,0", 'unit_cost "0.00" must be greater than 0'],
    ["a cost with one decimal", "AN3-9D,,NUT,Acme,8,1.5,0", 'unit_cost "1.5" is not dollars with 2 decimals, like 12.34'],
    ["a cost with three decimals", "AN3-9D,,NUT,Acme,8,1.455,0", 'unit_cost "1.455" is not dollars with 2 decimals, like 12.34'],
    ["a cost with a dollar sign", "AN3-9D,,NUT,Acme,8,$1.45,0", 'unit_cost "$1.45" is not dollars with 2 decimals, like 12.34'],
    ["a negative cost", "AN3-9D,,NUT,Acme,8,-1.45,0", 'unit_cost "-1.45" is not dollars with 2 decimals, like 12.34'],
    ["a cost too large for integer cents", "AN3-9D,,NUT,Acme,8,21474836.48,0", 'unit_cost "21474836.48" is too large'],
    ["a negative lead time", "AN3-9D,,NUT,Acme,8,1.45,-1", 'lead_time_days "-1" is not a whole number 0 or greater'],
    ["a blank part number", ",,NUT,Acme,8,1.45,0", "part_number is blank"],
    ["a part number with spaces around it", '" AN3-9D",,NUT,Acme,8,1.45,0', 'part_number " AN3-9D" has leading or trailing spaces'],
    ["a blank description", "AN3-9D,,,Acme,8,1.45,0", "description is blank"],
    ["a blank supplier", "AN3-9D,,NUT,,8,1.45,0", "supplier is blank"],
  ])("rejects %s with the line and the reason", (_label, row, message) => {
    expect(problemsFor(csv(GS9174A_A, row))).toEqual([{ line: 3, message }]);
  });

  it("rejects a repeated (part, supplier) pair, pointing at the first one", () => {
    expect(problemsFor(csv(GS9174A_A, MS29513_036, GS9174A_A))).toEqual([
      { line: 4, message: 'part GS9174A from supplier "Continental Hose Co" is already on line 2' },
    ]);
  });

  it("rejects one part number with two descriptions", () => {
    const other = GS9174A_B.replace("4.7K OHM", "10K OHM");
    expect(problemsFor(csv(GS9174A_A, other))).toEqual([
      {
        line: 3,
        message:
          'part GS9174A has description "RESISTOR,FIXED,FILM 10K OHM 1/4W" here but "RESISTOR,FIXED,FILM 4.7K OHM 1/4W" on line 2',
      },
    ]);
  });

  it("rejects one part number with two NSNs, including blank against set", () => {
    const blank = GS9174A_B.replace("5905-01-520-3335", "");
    expect(problemsFor(csv(GS9174A_A, blank))).toEqual([
      { line: 3, message: "part GS9174A has nsn blank here but 5905-01-520-3335 on line 2" },
    ]);
  });

  it("does not treat suppliers that differ only in case as duplicates", () => {
    const lower = GS9174A_B.replace("Lakeshore Precision", "continental hose co");
    expect(parseInventoryCsv(csv(GS9174A_A, lower)).offers).toHaveLength(2);
  });

  it("lists every problem in one pass", () => {
    const problems = problemsFor(csv("AN3-9D,,NUT,Acme,-1,1.45,0", GS9174A_A, "AN5-34,bad,NUT,Acme,8,0.00,0"));
    expect(problems).toEqual([
      { line: 2, message: 'qty_on_hand "-1" is not a whole number 0 or greater' },
      { line: 4, message: 'nsn "bad" is not in ####-##-###-#### format' },
      { line: 4, message: 'unit_cost "0.00" must be greater than 0' },
    ]);
  });

  it("counts lines from the file, even when a quoted field spans lines", () => {
    const multiline = 'AN5-34,,"NUT,\nSELF-LOCKING",Acme,8,1.94,14';
    expect(problemsFor(csv(multiline, "AN3-9D,,NUT,Acme,-1,1.45,0"))).toEqual([
      { line: 4, message: 'qty_on_hand "-1" is not a whole number 0 or greater' },
    ]);
  });

  it.each([
    ["a missing column", "part_number,nsn,description,supplier,qty_on_hand,unit_cost", 1, /^expected the header/],
    ["columns out of order", "nsn,part_number,description,supplier,qty_on_hand,unit_cost,lead_time_days", 1, /^expected the header/],
    ["a blank first line", "", 1, /found ""$/],
  ])("rejects a header with %s", (_label, header, line, message) => {
    const [problem] = problemsFor(`${header}\n`);
    expect(problem.line).toBe(line);
    expect(problem.message).toMatch(message);
  });

  it("rejects an empty file", () => {
    expect(problemsFor("")[0].message).toMatch(/found nothing$/);
  });

  it("rejects a file with no rows, rather than loading an empty inventory", () => {
    expect(problemsFor(`${HEADER}\n`)).toEqual([{ line: 2, message: "no inventory rows after the header" }]);
  });

  it.each([
    ["a row with too few columns", csv(GS9174A_A, "AN3-9D,,NUT,Acme,8,1.45"), 3, /^malformed CSV: Invalid Record Length/],
    ["an empty line between rows", csv(GS9174A_A, "", GS9174A_B), 3, /^malformed CSV: Invalid Record Length/],
    ["an unclosed quote", csv(GS9174A_A, 'AN3-9D,,"NUT,Acme,8,1.45,0'), 3, /^malformed CSV: Quote Not Closed/],
  ])("rejects %s as malformed CSV", (_label, text, line, message) => {
    const [problem] = problemsFor(text);
    expect(problem.line).toBe(line);
    expect(problem.message).toMatch(message);
  });

  it("summarizes every problem in the error message", () => {
    expect(() => parseInventoryCsv(csv("AN3-9D,,NUT,Acme,-1,1.45,0"))).toThrow(
      'Inventory CSV has 1 problem:\n  Line 2: qty_on_hand "-1" is not a whole number 0 or greater',
    );
  });
});
