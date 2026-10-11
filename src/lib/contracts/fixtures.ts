import type { ReviewSeed } from "./extraction";

/**
 * Review seeds for building the review UI before extraction (T2) and matching (T3) land.
 *
 * Part numbers, NSNs, suppliers, stock, and prices are real rows from
 * mock_data/shared/inventory.csv. Each line's `sourceText` is copied verbatim from
 * `emailText`, as the model is told to do, so source highlighting works too.
 */
export type ReviewFixture = {
  /** What the rep pasted; stored as `extraction.email_text`. */
  emailText: string;
  /** What the review page renders; stored as `extraction.result`. */
  seed: ReviewSeed;
};

/** (a) A clean table where every line is a safe, high-confidence match. */
export const cleanEmail: ReviewFixture = {
  emailText: `Hi team,

Please quote the following for our Q4 restock:

| Part Number | NSN              | Qty |
|-------------|------------------|-----|
| MS9556-82   | 5310-00-873-5749 | 10  |
| 96F62405-7  |                  | 4   |
|             | 5310-21-016-3476 | 25  |

Thanks,
Dana Whitfield
Purchasing, Northwind Avionics`,
  seed: {
    lines: [
      {
        extracted: {
          index: 0,
          sourceText: "| MS9556-82   | 5310-00-873-5749 | 10  |",
          partNumber: "MS9556-82",
          nsn: "5310-00-873-5749",
          description: null,
          quantityEach: 10,
          quantityAsWritten: "10",
          warnings: [],
        },
        match: {
          confidence: "high",
          reason: "Exact part number match",
          candidates: [
            {
              partNumber: "MS9556-82",
              nsn: "5310-00-873-5749",
              description: "NUT,SELF-LOCKING,CLINCH #4-40 UNC",
              kind: "part_number",
              score: 1,
              reason: "Exact part number match, and the NSN agrees",
              offers: [
                { supplier: "Eagle Rock Electronics", qtyOnHand: 18, unitCostCents: 34, leadTimeDays: 7 },
                { supplier: "Riverside Precision Bolt", qtyOnHand: 9, unitCostCents: 36, leadTimeDays: 28 },
                { supplier: "Harbor Point Industrial", qtyOnHand: 11, unitCostCents: 37, leadTimeDays: 35 },
              ],
            },
          ],
          defaultPartNumber: "MS9556-82",
          defaultSupplier: "Eagle Rock Electronics",
          defaultSupplierReason: "Cheapest supplier that can fill 10",
        },
      },
      {
        extracted: {
          index: 1,
          sourceText: "| 96F62405-7  |                  | 4   |",
          partNumber: "96F62405-7",
          nsn: null,
          description: null,
          quantityEach: 4,
          quantityAsWritten: "4",
          warnings: [],
        },
        match: {
          confidence: "high",
          reason: "Exact part number match",
          candidates: [
            {
              partNumber: "96F62405-7",
              nsn: "4730-01-288-7855",
              description: "UNION,TUBE TITANIUM",
              kind: "part_number",
              score: 1,
              reason: "Exact part number match",
              offers: [
                { supplier: "Lakeshore Precision", qtyOnHand: 11, unitCostCents: 1479, leadTimeDays: 14 },
                { supplier: "Frontier Turbine Parts", qtyOnHand: 15, unitCostCents: 1489, leadTimeDays: 120 },
                { supplier: "Bay Aero Components", qtyOnHand: 59, unitCostCents: 1833, leadTimeDays: 35 },
              ],
            },
          ],
          defaultPartNumber: "96F62405-7",
          defaultSupplier: "Lakeshore Precision",
          defaultSupplierReason: "Cheapest supplier that can fill 4",
        },
      },
      {
        extracted: {
          index: 2,
          sourceText: "|             | 5310-21-016-3476 | 25  |",
          partNumber: null,
          nsn: "5310-21-016-3476",
          description: null,
          quantityEach: 25,
          quantityAsWritten: "25",
          warnings: [],
        },
        match: {
          confidence: "high",
          reason: "Exact NSN match",
          candidates: [
            {
              partNumber: "AN3-9D",
              nsn: "5310-21-016-3476",
              description: "NUT,SELF-LOCKING,CLINCH 5/16-24 UNF",
              kind: "nsn",
              score: 1,
              reason: "Exact NSN match",
              offers: [
                { supplier: "Tri-County Fastener", qtyOnHand: 8, unitCostCents: 145, leadTimeDays: 180 },
                { supplier: "Copperline Electronics", qtyOnHand: 9, unitCostCents: 189, leadTimeDays: 14 },
                { supplier: "Hudson Valley Bearing", qtyOnHand: 31, unitCostCents: 193, leadTimeDays: 56 },
              ],
            },
          ],
          defaultPartNumber: "AN3-9D",
          defaultSupplier: "Hudson Valley Bearing",
          defaultSupplierReason: "Cheapest supplier that can fill 25",
        },
      },
    ],
    notices: [],
  },
};

/**
 * (b) A reply chain that exercises every line state: high (line 0), low with three
 * candidates (line 1), none (line 2), short stock (line 3), a converted unit (line 4),
 * a unit that can't be converted (line 5), and an exact match capped at Low only because
 * of LINE_NOT_GROUNDED (line 6), plus a SUPERSEDED notice.
 */
export const mixedEmail: ReviewFixture = {
  emailText: `Hi,

Updated list below. This replaces the one I sent Monday, we no longer need the MS9556-82.

1. AL14720-1, qty 40
2. MS29513-034 o-ring, 12 ea
3. ZX-4471-B hydraulic coupler, qty 2
4. M39029/41-861 backshell x 50
5. MS21044-243P screws, 2 boxes of 100
6. M22759/13-12-3 wire, 3 spools
7. Tube union 96F62405-7
   qty 6, same as our last order

Need these by end of month if possible.

Sam Okafor
Okafor Marine Systems

-----Original Message-----
From: Sam Okafor
Sent: Monday, October 5, 2026 9:12 AM
Subject: RFQ

Please quote:
- AL14720-1, qty 20
- MS9556-82, qty 100`,
  seed: {
    lines: [
      {
        extracted: {
          index: 0,
          sourceText: "1. AL14720-1, qty 40",
          partNumber: "AL14720-1",
          nsn: null,
          description: null,
          quantityEach: 40,
          quantityAsWritten: "40",
          warnings: [],
        },
        match: {
          confidence: "high",
          reason: "Exact part number match",
          candidates: [
            {
              partNumber: "AL14720-1",
              nsn: "5310-00-057-5543",
              description: "NUT,SELF-LOCKING,CLINCH #6-32 UNC",
              kind: "part_number",
              score: 1,
              reason: "Exact part number match",
              offers: [
                { supplier: "Lakeshore Precision", qtyOnHand: 17, unitCostCents: 337, leadTimeDays: 45 },
                { supplier: "Cascade Aerospace Parts", qtyOnHand: 10, unitCostCents: 424, leadTimeDays: 7 },
                { supplier: "Harbor Point Industrial", qtyOnHand: 8, unitCostCents: 458, leadTimeDays: 35 },
                { supplier: "Frontier Turbine Parts", qtyOnHand: 43, unitCostCents: 461, leadTimeDays: 56 },
              ],
            },
          ],
          defaultPartNumber: "AL14720-1",
          defaultSupplier: "Frontier Turbine Parts",
          defaultSupplierReason: "Cheapest supplier that can fill 40",
        },
      },
      {
        extracted: {
          index: 1,
          sourceText: "2. MS29513-034 o-ring, 12 ea",
          partNumber: "MS29513-034",
          nsn: null,
          description: "o-ring",
          quantityEach: 12,
          quantityAsWritten: "12 ea",
          warnings: [],
        },
        match: {
          confidence: "low",
          reason: "No exact match. Closest part number differs by 1 character.",
          candidates: [
            {
              partNumber: "MS29513-033",
              nsn: "5330-01-170-2138",
              description: "PACKING,PREFORMED AS568-218",
              kind: "part_number_fuzzy",
              score: 0.69,
              reason: "Closest part number, differs by 1 character",
              offers: [{ supplier: "Delta Wire & Cable", qtyOnHand: 10, unitCostCents: 420, leadTimeDays: 35 }],
            },
            {
              partNumber: "MS29513-032",
              nsn: null,
              description: "SEAL,PLAIN ENCASED AS568-218",
              kind: "part_number_fuzzy",
              score: 0.69,
              reason: "Similar part number, differs by 1 character",
              offers: [
                { supplier: "Riverside Precision Bolt", qtyOnHand: 9, unitCostCents: 340, leadTimeDays: 42 },
                { supplier: "Granite State Fasteners", qtyOnHand: 10, unitCostCents: 350, leadTimeDays: 21 },
              ],
            },
            {
              partNumber: "MS29513-037",
              nsn: null,
              description: "SEAL,NONMETALLIC SPECIAL SHAPED SECTION AS568-012",
              kind: "part_number_fuzzy",
              score: 0.69,
              reason: "Similar part number, differs by 1 character",
              offers: [
                { supplier: "Ridgeline MRO Supply", qtyOnHand: 0, unitCostCents: 116, leadTimeDays: 70 },
                { supplier: "Copperline Electronics", qtyOnHand: 19, unitCostCents: 162, leadTimeDays: 84 },
              ],
            },
          ],
          defaultPartNumber: null,
          defaultSupplier: null,
          defaultSupplierReason: null,
        },
      },
      {
        extracted: {
          index: 2,
          sourceText: "3. ZX-4471-B hydraulic coupler, qty 2",
          partNumber: "ZX-4471-B",
          nsn: null,
          description: "hydraulic coupler",
          quantityEach: 2,
          quantityAsWritten: "2",
          warnings: [],
        },
        match: {
          confidence: "none",
          reason: "Not in inventory",
          candidates: [],
          defaultPartNumber: null,
          defaultSupplier: null,
          defaultSupplierReason: null,
        },
      },
      {
        extracted: {
          index: 3,
          sourceText: "4. M39029/41-861 backshell x 50",
          partNumber: "M39029/41-861",
          nsn: null,
          description: "backshell",
          quantityEach: 50,
          quantityAsWritten: "50",
          warnings: [],
        },
        match: {
          confidence: "high",
          reason: "Exact part number match",
          candidates: [
            {
              partNumber: "M39029/41-861",
              nsn: "5935-14-334-0202",
              description: "BACKSHELL,ELECTRICAL CONNECTOR SHELL 24",
              kind: "part_number",
              score: 1,
              reason: "Exact part number match",
              offers: [
                { supplier: "Ironclad Industrial Supply", qtyOnHand: 32, unitCostCents: 13569, leadTimeDays: 28 },
                { supplier: "Harbor Point Industrial", qtyOnHand: 0, unitCostCents: 14264, leadTimeDays: 7 },
                { supplier: "Copperline Electronics", qtyOnHand: 0, unitCostCents: 16598, leadTimeDays: 120 },
              ],
            },
          ],
          defaultPartNumber: "M39029/41-861",
          defaultSupplier: "Ironclad Industrial Supply",
          defaultSupplierReason: "No supplier can fill 50. Most on hand: 32",
        },
      },
      {
        extracted: {
          index: 4,
          sourceText: "5. MS21044-243P screws, 2 boxes of 100",
          partNumber: "MS21044-243P",
          nsn: null,
          description: "screws",
          quantityEach: 200,
          quantityAsWritten: "2 boxes of 100",
          warnings: [{ code: "UNIT_CONVERTED", message: "2 boxes of 100 = 200 EA" }],
        },
        match: {
          confidence: "high",
          reason: "Exact part number match",
          candidates: [
            {
              partNumber: "MS21044-243P",
              nsn: "5305-01-876-0919",
              description: "SCREW,CAP,SOCKET HEAD #4-40 UNC",
              kind: "part_number",
              score: 1,
              reason: "Exact part number match",
              offers: [
                { supplier: "Orion Microcircuits", qtyOnHand: 13, unitCostCents: 21, leadTimeDays: 0 },
                { supplier: "Vanguard Aviation Spares", qtyOnHand: 209, unitCostCents: 23, leadTimeDays: 14 },
                { supplier: "Bridgewater Avionics", qtyOnHand: 641, unitCostCents: 26, leadTimeDays: 70 },
              ],
            },
          ],
          defaultPartNumber: "MS21044-243P",
          defaultSupplier: "Vanguard Aviation Spares",
          defaultSupplierReason: "Cheapest supplier that can fill 200",
        },
      },
      {
        extracted: {
          index: 5,
          sourceText: "6. M22759/13-12-3 wire, 3 spools",
          partNumber: "M22759/13-12-3",
          nsn: null,
          description: "wire",
          quantityEach: null,
          quantityAsWritten: "3 spools",
          warnings: [
            {
              code: "UNIT_UNKNOWN",
              message: 'Can\'t convert "spools" to each. Confirm the quantity.',
            },
          ],
        },
        match: {
          confidence: "high",
          reason: "Exact part number match",
          candidates: [
            {
              partNumber: "M22759/13-12-3",
              nsn: "6145-00-365-8927",
              description: "WIRE,ELECTRICAL 1K OHM 1/4W",
              kind: "part_number",
              score: 1,
              reason: "Exact part number match",
              offers: [
                { supplier: "Copperline Electronics", qtyOnHand: 69, unitCostCents: 745, leadTimeDays: 70 },
                { supplier: "Pioneer Seal & Gasket", qtyOnHand: 30, unitCostCents: 809, leadTimeDays: 70 },
                { supplier: "Ironclad Industrial Supply", qtyOnHand: 25, unitCostCents: 852, leadTimeDays: 21 },
                { supplier: "Orion Microcircuits", qtyOnHand: 19, unitCostCents: 974, leadTimeDays: 45 },
              ],
            },
          ],
          defaultPartNumber: "M22759/13-12-3",
          defaultSupplier: "Copperline Electronics",
          defaultSupplierReason: "Cheapest supplier. Quantity not confirmed yet",
        },
      },
      {
        // The model attached the part number from the line above to this quantity line.
        extracted: {
          index: 6,
          sourceText: "qty 6, same as our last order",
          partNumber: "96F62405-7",
          nsn: null,
          description: "Tube union",
          quantityEach: 6,
          quantityAsWritten: "6",
          warnings: [
            {
              code: "LINE_NOT_GROUNDED",
              message: "Part number 96F62405-7 isn't in this line's text. Confirm the quantity belongs to it.",
            },
          ],
        },
        match: {
          confidence: "low",
          reason: "Couldn't confirm this part number belongs to this line",
          candidates: [
            {
              partNumber: "96F62405-7",
              nsn: "4730-01-288-7855",
              description: "UNION,TUBE TITANIUM",
              kind: "part_number",
              score: 1,
              reason: "Exact part number match",
              offers: [
                { supplier: "Lakeshore Precision", qtyOnHand: 11, unitCostCents: 1479, leadTimeDays: 14 },
                { supplier: "Frontier Turbine Parts", qtyOnHand: 15, unitCostCents: 1489, leadTimeDays: 120 },
                { supplier: "Bay Aero Components", qtyOnHand: 59, unitCostCents: 1833, leadTimeDays: 35 },
              ],
            },
          ],
          defaultPartNumber: null,
          defaultSupplier: null,
          defaultSupplierReason: null,
        },
      },
    ],
    notices: [
      {
        code: "SUPERSEDED",
        message: "The latest message replaces the one sent Monday. MS9556-82 is no longer needed.",
      },
    ],
  },
};

/** (c) An out-of-office reply with nothing to quote. */
export const noItemsEmail: ReviewFixture = {
  emailText: `Subject: Automatic reply: RFQ for hydraulic fittings

Thank you for your message. I am out of the office until Monday, October 19, with limited access to email.

For urgent quote requests, please contact our purchasing desk at purchasing@example.com.

Regards,
Priya Natarajan`,
  seed: {
    lines: [],
    notices: [
      {
        code: "NO_ITEMS",
        message: "This looks like an automatic out-of-office reply. No items were requested.",
      },
    ],
  },
};

export const reviewFixtures = { cleanEmail, mixedEmail, noItemsEmail };
