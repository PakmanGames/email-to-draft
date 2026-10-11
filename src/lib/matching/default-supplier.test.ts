import { describe, expect, it } from "vitest";
import type { Offer } from "@/lib/contracts";
import { pickDefaultSupplier } from "./default-supplier";

function offer(supplier: string, qtyOnHand: number, unitCostCents: number, leadTimeDays = 14): Offer {
  return { supplier, qtyOnHand, unitCostCents, leadTimeDays };
}

describe("pickDefaultSupplier", () => {
  it("picks the only offer that can fill the request, even when another is cheaper", () => {
    const offers = [offer("Cheap", 5, 100), offer("Stocked", 50, 150)];
    expect(pickDefaultSupplier(offers, 10)).toEqual({
      supplier: "Stocked",
      reason: "Cheapest supplier that can fill 10",
    });
  });

  it("picks the cheapest of several offers that can fill the request", () => {
    const offers = [offer("Pricey", 100, 300), offer("Middle", 100, 200), offer("Short", 1, 50)];
    expect(pickDefaultSupplier(offers, 10).supplier).toBe("Middle");
  });

  it("counts an offer with exactly the requested quantity as able to fill it", () => {
    const offers = [offer("Exact", 10, 100), offer("Plenty", 99, 200)];
    expect(pickDefaultSupplier(offers, 10).supplier).toBe("Exact");
  });

  it("breaks a price tie by shorter lead time, then by supplier name", () => {
    expect(pickDefaultSupplier([offer("Slow", 20, 100, 30), offer("Fast", 20, 100, 7)], 10).supplier).toBe("Fast");
    expect(pickDefaultSupplier([offer("Bravo", 20, 100, 7), offer("Alpha", 20, 100, 7)], 10).supplier).toBe("Alpha");
  });

  it("picks the most on hand when no offer can fill the request", () => {
    const offers = [offer("Few", 5, 100), offer("Most", 32, 900), offer("None", 0, 50)];
    expect(pickDefaultSupplier(offers, 50)).toEqual({
      supplier: "Most",
      reason: "No supplier can fill 50. Most on hand: 32",
    });
  });

  it("breaks a most-on-hand tie by price, then by lead time", () => {
    expect(pickDefaultSupplier([offer("Dear", 8, 200), offer("Cheap", 8, 100)], 50).supplier).toBe("Cheap");
    expect(pickDefaultSupplier([offer("Slow", 8, 100, 30), offer("Fast", 8, 100, 7)], 50).supplier).toBe("Fast");
  });

  it("states a 0 on hand plainly when every offer is out of stock", () => {
    const offers = [offer("Dear", 0, 200), offer("Cheap", 0, 100)];
    expect(pickDefaultSupplier(offers, 5)).toEqual({
      supplier: "Cheap",
      reason: "No supplier can fill 5. Most on hand: 0",
    });
  });

  it("picks the cheapest offer when the quantity isn't known yet", () => {
    const offers = [offer("Stocked", 500, 200), offer("Cheap", 0, 100)];
    expect(pickDefaultSupplier(offers, null)).toEqual({
      supplier: "Cheap",
      reason: "Cheapest supplier. Quantity not confirmed yet",
    });
  });

  it("writes large quantities with thousands separators", () => {
    expect(pickDefaultSupplier([offer("Big", 2000, 100)], 1500).reason).toBe("Cheapest supplier that can fill 1,500");
    expect(pickDefaultSupplier([offer("Big", 1200, 100)], 1500).reason).toBe(
      "No supplier can fill 1,500. Most on hand: 1,200",
    );
  });
});
