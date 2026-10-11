import type { Db } from "@/lib/db/client";
import { offer, part } from "@/lib/db/schema";
import type { Inventory, InventoryOffer } from "./parse";

// Well under Postgres's 65,535 bind parameters per statement (offers use 5 per row).
const BATCH_SIZE = 1000;

/**
 * Replaces all parts and offers with `inventory` in one transaction (INV-1). Any failure
 * rolls back, leaving the previous inventory in place (INV-4). Saved drafts are unaffected,
 * because quote lines are snapshots that don't reference these tables.
 *
 * Returns the row counts read back inside the transaction, so they report what was stored.
 */
export async function replaceInventory(db: Db, inventory: Inventory): Promise<{ parts: number; offers: number }> {
  return db.transaction(async (tx) => {
    // DELETE rather than TRUNCATE: readers keep seeing the old inventory until commit
    // instead of blocking on an exclusive lock. Offers go first because they reference parts.
    await tx.delete(offer);
    await tx.delete(part);
    for (const batch of chunk(inventory.parts)) await tx.insert(part).values(batch);
    for (const batch of chunk(inventory.offers.map(toOfferRow))) await tx.insert(offer).values(batch);
    return { parts: await tx.$count(part), offers: await tx.$count(offer) };
  });
}

function toOfferRow(o: InventoryOffer): typeof offer.$inferInsert {
  return {
    partNumber: o.partNumber,
    supplier: o.supplier,
    qtyOnHand: o.qtyOnHand,
    unitCost: centsToNumeric(o.unitCostCents),
    leadTimeDays: o.leadTimeDays,
  };
}

/** 168 -> "1.68". A string, so the numeric(12, 2) column stores it exactly. */
function centsToNumeric(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function chunk<T>(items: T[]): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
  return batches;
}
