import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QuoteSummary } from "@/lib/contracts";
import { QuotesTable } from "./quotes-table";

const shortDraft: QuoteSummary = {
  id: "0b6f3c2e-5f8a-4d1b-9c3e-7a2d4e6f8a10",
  createdAt: new Date("2026-10-11T22:49:00Z"),
  lineCount: 3,
  unmatchedCount: 1,
  shortStockCount: 2,
  markupBps: 2500,
  totalCents: 1_234_567,
};
const cleanDraft: QuoteSummary = {
  id: "1c7a4d3f-6a9b-4e2c-8d4f-8b3e5f7a9b21",
  createdAt: new Date("2026-10-10T15:05:00Z"),
  lineCount: 4,
  unmatchedCount: 0,
  shortStockCount: 0,
  markupBps: 1250,
  totalCents: 9594,
};

function rowFor(quoteId: string) {
  const link = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `/quotes/${quoteId}`);
  return link!.closest("tr")!;
}

describe("QuotesTable", () => {
  it("shows each draft's counts, markup, and total, and links to it", () => {
    render(<QuotesTable quotes={[shortDraft, cleanDraft]} />);

    const cells = within(rowFor(cleanDraft.id))
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(1)).toEqual(["4", "0", "0", "12.5%", "$95.94"]);
    expect(within(rowFor(shortDraft.id)).getByText("$12,345.67")).toBeDefined();
  });

  it("lists drafts in the order given, which is newest first", () => {
    render(<QuotesTable quotes={[shortDraft, cleanDraft]} />);

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([`/quotes/${shortDraft.id}`, `/quotes/${cleanDraft.id}`]);
  });

  it("flags short stock with words, not only color", () => {
    render(<QuotesTable quotes={[shortDraft, cleanDraft]} />);

    expect(within(rowFor(shortDraft.id)).getByText("lines quote more than on hand")).toBeDefined();
    expect(within(rowFor(cleanDraft.id)).queryByText(/more than on hand/)).toBeNull();
  });

  it("shows the saved time in the browser's timezone", () => {
    render(<QuotesTable quotes={[shortDraft]} />);

    const time = rowFor(shortDraft.id).querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-10-11T22:49:00.000Z");
    expect(time.textContent).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(shortDraft.createdAt),
    );
  });

  it("explains the empty list and links to the paste page", () => {
    render(<QuotesTable quotes={[]} />);

    expect(screen.getByText("No drafts yet")).toBeDefined();
    expect(screen.getByRole("link", { name: "Paste an email" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("table")).toBeNull();
  });
});
