import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QuoteDetail, QuoteLine } from "@/lib/contracts";
import { QuoteDetailView } from "./quote-detail";

const base = {
  origin: "extracted",
  edited: false,
  matchConfidence: "high",
  matchReason: "Exact part number match",
} as const;

// Bay Aero's 59 on hand covers 4; Lakeshore's 11 does not cover 20.
const covered: QuoteLine = {
  ...base,
  position: 0,
  requestedText: "96F62405-7 qty 4",
  quantity: 4,
  suggestedPartNumber: "96F62405-7",
  partNumber: "96F62405-7",
  description: "UNION,TUBE TITANIUM",
  supplier: "Bay Aero Components",
  unitCostCents: 1833,
  unitPriceCents: 2291,
  qtyOnHand: 59,
  leadTimeDays: 35,
};
const short: QuoteLine = {
  ...covered,
  position: 1,
  requestedText: "96F62405-7 qty 20",
  quantity: 20,
  supplier: "Lakeshore Precision",
  unitCostCents: 1479,
  unitPriceCents: 1849,
  qtyOnHand: 11,
  leadTimeDays: 14,
};
const unmatched: QuoteLine = {
  ...base,
  position: 2,
  requestedText: "ZX-4471-B hydraulic coupler, qty 2",
  quantity: 2,
  matchConfidence: "none",
  matchReason: "Not in inventory",
  suggestedPartNumber: null,
  partNumber: null,
  description: null,
  supplier: null,
  unitCostCents: null,
  unitPriceCents: null,
  qtyOnHand: null,
  leadTimeDays: null,
};

function draft(lines: QuoteLine[]): QuoteDetail {
  return {
    id: "0b6f3c2e-5f8a-4d1b-9c3e-7a2d4e6f8a10",
    createdAt: new Date("2026-10-11T22:49:00Z"),
    extractionId: "7d1e5a6c-3a51-4b8e-9a43-2f0f5b6c1d20",
    markupBps: 2500,
    totalCents: lines.reduce((sum, line) => sum + (line.unitPriceCents ?? 0) * line.quantity, 0),
    lines,
  };
}

function row(position: number) {
  return screen.getAllByRole("row").find((tr) => tr.firstElementChild?.textContent === String(position + 1))!;
}

describe("QuoteDetailView", () => {
  it("warns at the top when any line quotes more than on hand, and marks the line", () => {
    render(<QuoteDetailView quote={draft([covered, short, unmatched])} />);

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain("1 line quotes more than on hand");
    expect(within(row(1)).getByText("Short by 9")).toBeDefined();
    expect(within(row(0)).queryByText(/Short by/)).toBeNull();
  });

  it("counts every short line in the warning", () => {
    render(<QuoteDetailView quote={draft([short, { ...short, position: 2, quantity: 12 }])} />);

    expect(screen.getByRole("alert").textContent).toContain("2 lines quote more than on hand");
  });

  it("shows no warning when every line is covered, including one at exactly on hand", () => {
    render(<QuoteDetailView quote={draft([covered, { ...short, quantity: 11 }, unmatched])} />);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/Short by/)).toBeNull();
  });

  it("shows each priced line's unit price with its cost, and the extended price", () => {
    render(<QuoteDetailView quote={draft([covered])} />);

    const cells = within(row(0)).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "1",
      "96F62405-7 qty 4",
      "96F62405-7UNION,TUBE TITANIUM",
      "Bay Aero Components",
      "4",
      "59",
      "35 days",
      "$22.91Cost $18.33",
      "$91.64",
    ]);
  });

  it("shows an unmatched line unpriced and says it is left out of the total", () => {
    render(<QuoteDetailView quote={draft([covered, unmatched])} />);

    const cells = within(row(2)).getAllByRole("cell");
    expect(cells[2].textContent).toBe("Unmatched");
    expect(cells.slice(5).map((cell) => cell.textContent)).toEqual(["—", "—", "—", "—"]);
    expect(screen.getByText("1 unpriced line is not included in the total.")).toBeDefined();
  });

  it("shows the markup, total, and extraction ID as plain text", () => {
    render(<QuoteDetailView quote={draft([covered, short])} />);

    expect(screen.getByText("25%")).toBeDefined();
    expect(screen.getAllByText("$461.44")).toHaveLength(2); // summary and table footer
    expect(screen.getByText("7d1e5a6c-3a51-4b8e-9a43-2f0f5b6c1d20").closest("a")).toBeNull();
  });

  it("says so when the draft has no lines", () => {
    render(<QuoteDetailView quote={draft([])} />);

    expect(screen.getByText("This draft has no lines.")).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
