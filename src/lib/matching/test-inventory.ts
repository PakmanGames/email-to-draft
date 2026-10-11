import type { Db } from "@/lib/db/client";
import { offer, part } from "@/lib/db/schema";

/**
 * A small inventory for matching tests, with one part or pair of parts per situation in
 * the confidence table. Part numbers and descriptions come from
 * mock_data/shared/inventory.csv, so similarity scores behave as they do on the full
 * inventory; some NSNs and offers are made up. Only for tests.
 */
export const TEST_PARTS = [
  {
    partNumber: "MS9556-82",
    nsn: "5310-00-873-5749",
    description: "NUT,SELF-LOCKING,CLINCH #4-40 UNC",
    offers: [
      { supplier: "Riverside Precision Bolt", qtyOnHand: 9, unitCost: "0.36", leadTimeDays: 28 },
      { supplier: "Eagle Rock Electronics", qtyOnHand: 18, unitCost: "0.34", leadTimeDays: 7 },
      { supplier: "Harbor Point Industrial", qtyOnHand: 0, unitCost: "0.37", leadTimeDays: 35 },
    ],
  },
  {
    partNumber: "AN3-9D",
    nsn: "5310-21-016-3476",
    description: "NUT,SELF-LOCKING,CLINCH 5/16-24 UNF",
    offers: [{ supplier: "Tri-County Fastener", qtyOnHand: 8, unitCost: "1.45", leadTimeDays: 180 }],
  },
  // Two parts that share one NSN.
  {
    partNumber: "7170-9665-59",
    nsn: "5310-01-449-0355",
    description: "NUT,PLAIN,HEXAGON #6-32 UNC",
    offers: [{ supplier: "Lakeshore Precision", qtyOnHand: 40, unitCost: "0.52", leadTimeDays: 14 }],
  },
  {
    partNumber: "NAS1291C333P",
    nsn: "5310-01-449-0355",
    description: "WASHER,LOCK 1/2-20 UNF",
    offers: [{ supplier: "Bay Aero Components", qtyOnHand: 12, unitCost: "0.88", leadTimeDays: 21 }],
  },
  // Two part numbers with the same key once dashes are ignored.
  {
    partNumber: "NAS6203-852R",
    nsn: "5306-01-123-4567",
    description: "BOLT,CLOSE TOLERANCE #6-32 UNC",
    offers: [{ supplier: "Vanguard Aviation Spares", qtyOnHand: 30, unitCost: "2.10", leadTimeDays: 14 }],
  },
  {
    partNumber: "NAS6203852R",
    nsn: "5306-01-765-4321",
    description: "BOLT,CLOSE TOLERANCE #8-32 UNC",
    offers: [{ supplier: "Vanguard Aviation Spares", qtyOnHand: 30, unitCost: "2.20", leadTimeDays: 14 }],
  },
  // A one-character typo of this part number appears in sample email 02.
  {
    partNumber: "2437-3308-66",
    nsn: "4720-01-773-9567",
    description: "HOSE,NONMETALLIC -6 X 24 IN",
    offers: [{ supplier: "Continental Hose Co", qtyOnHand: 25, unitCost: "18.40", leadTimeDays: 21 }],
  },
  // Parts without an NSN, stored as NULL.
  {
    partNumber: "167-1343-05",
    nsn: null,
    description: "HOSE ASSEMBLY,METAL -6 X 24 IN",
    offers: [{ supplier: "Liberty Hose & Fitting", qtyOnHand: 30, unitCost: "41.00", leadTimeDays: 28 }],
  },
  {
    partNumber: "59M19353-9",
    nsn: null,
    description: "HOSE ASSEMBLY,NONMETALLIC -6 X 24 IN",
    offers: [{ supplier: "Continental Hose Co", qtyOnHand: 4, unitCost: "36.50", leadTimeDays: 14 }],
  },
  {
    partNumber: "M83248/2-299",
    nsn: "5330-01-234-5678",
    description: "PACKING,PREFORMED AS568-214",
    offers: [{ supplier: "Pioneer Seal & Gasket", qtyOnHand: 300, unitCost: "0.95", leadTimeDays: 7 }],
  },
] as const;

/** Inserts `TEST_PARTS` and their offers. */
export async function seedTestInventory(db: Db): Promise<void> {
  await db.insert(part).values(
    TEST_PARTS.map(({ partNumber, nsn, description }) => ({ partNumber, nsn, description })),
  );
  await db
    .insert(offer)
    .values(TEST_PARTS.flatMap(({ partNumber, offers }) => offers.map((o) => ({ partNumber, ...o }))));
}
