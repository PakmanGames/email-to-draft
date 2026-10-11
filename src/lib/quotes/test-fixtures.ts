// Shared by the quotes integration tests. Not imported by app code.
import type { SaveQuoteRequest } from "@/lib/contracts";
import type { Db } from "@/lib/db/client";
import { extraction, offer, part } from "@/lib/db/schema";

type SaveLine = SaveQuoteRequest["lines"][number];

/**
 * A few real rows from mock_data/shared/inventory.csv. Costs are dollars, as the column
 * stores them. Bay Aero's 18.33 at 25% is 22.9125, and Eagle Rock's 0.34 is 0.425, so
 * they exercise rounding down and rounding half up.
 */
export async function insertInventory(db: Db): Promise<void> {
  await db.insert(part).values([
    { partNumber: "MS9556-82", nsn: "5310-00-873-5749", description: "NUT,SELF-LOCKING,CLINCH #4-40 UNC" },
    { partNumber: "96F62405-7", nsn: null, description: "UNION,TUBE TITANIUM" },
    { partNumber: "MS29513-037", nsn: null, description: "SEAL,NONMETALLIC SPECIAL SHAPED SECTION AS568-012" },
  ]);
  await db.insert(offer).values([
    { partNumber: "MS9556-82", supplier: "Eagle Rock Electronics", qtyOnHand: 18, unitCost: "0.34", leadTimeDays: 7 },
    { partNumber: "MS9556-82", supplier: "Riverside Precision Bolt", qtyOnHand: 9, unitCost: "0.36", leadTimeDays: 28 },
    { partNumber: "96F62405-7", supplier: "Bay Aero Components", qtyOnHand: 59, unitCost: "18.33", leadTimeDays: 35 },
    { partNumber: "96F62405-7", supplier: "Lakeshore Precision", qtyOnHand: 11, unitCost: "14.79", leadTimeDays: 14 },
    { partNumber: "MS29513-037", supplier: "Ridgeline MRO Supply", qtyOnHand: 0, unitCost: "1.16", leadTimeDays: 70 },
  ]);
}

/** Quotes reference their extraction by foreign key, so every test draft needs one. */
export async function insertExtraction(db: Db): Promise<string> {
  const [{ id }] = await db
    .insert(extraction)
    .values({ emailText: "Please quote the attached.", status: "succeeded", model: "test", promptVersion: "test" })
    .returning({ id: extraction.id });
  return id;
}

export function matchedLine(partNumber: string, supplier: string, quantity: number): SaveLine {
  return {
    origin: "extracted",
    edited: false,
    requestedText: `${partNumber} qty ${quantity}`,
    quantity,
    matchConfidence: "high",
    matchReason: "Exact part number match",
    suggestedPartNumber: partNumber,
    partNumber,
    supplier,
  };
}

export function unmatchedLine(requestedText: string, quantity: number): SaveLine {
  return {
    origin: "extracted",
    edited: false,
    requestedText,
    quantity,
    matchConfidence: "none",
    matchReason: "Not in inventory",
    suggestedPartNumber: null,
    partNumber: null,
    supplier: null,
  };
}
