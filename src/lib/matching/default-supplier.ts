import type { Offer } from "@/lib/contracts";

/**
 * The default supplier rule (technical design 7, PRD assumption 7): the cheapest offer that
 * can fill the requested quantity, ties broken by shorter lead time. If none can, the offer
 * with the most on hand, ties broken by price. Supplier name breaks any remaining tie, so
 * the choice never depends on row order.
 *
 * Pure and dependency-free, so the review screen can reuse it when the rep picks another
 * candidate or changes the quantity. `offers` must not be empty; every candidate has one.
 */
export function pickDefaultSupplier(
  offers: Offer[],
  quantityEach: number | null,
): { supplier: string; reason: string } {
  if (quantityEach === null) {
    return { supplier: first(offers, byPrice).supplier, reason: "Cheapest supplier. Quantity not confirmed yet" };
  }

  const canFill = offers.filter((offer) => offer.qtyOnHand >= quantityEach);
  if (canFill.length > 0) {
    return {
      supplier: first(canFill, byPrice).supplier,
      reason: `Cheapest supplier that can fill ${formatCount(quantityEach)}`,
    };
  }

  const most = first(offers, (a, b) => b.qtyOnHand - a.qtyOnHand || byPrice(a, b));
  return {
    supplier: most.supplier,
    reason: `No supplier can fill ${formatCount(quantityEach)}. Most on hand: ${formatCount(most.qtyOnHand)}`,
  };
}

function byPrice(a: Offer, b: Offer): number {
  return a.unitCostCents - b.unitCostCents || a.leadTimeDays - b.leadTimeDays || compareText(a.supplier, b.supplier);
}

function first(offers: Offer[], compare: (a: Offer, b: Offer) => number): Offer {
  return offers.toSorted(compare)[0];
}

// Plain code-unit order, not localeCompare, so server and browser always agree.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}
