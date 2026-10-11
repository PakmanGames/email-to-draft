import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candidate, SaveQuoteRequest } from "@/lib/contracts";
import { reviewFixtures } from "@/lib/contracts/fixtures";
import { unitPriceCents } from "@/lib/pricing";
import { formatCents } from "./format";
import { ReviewScreen } from "./review-screen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const extractionId = "00000000-0000-4000-8000-000000000002";
const quoteId = "11111111-1111-4111-8111-111111111111";
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  push.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderMixed() {
  const { emailText, seed } = reviewFixtures.mixedEmail;
  render(<ReviewScreen extractionId={extractionId} emailText={emailText} seed={seed} />);
  return userEvent.setup();
}

const line = (n: number) => screen.getByRole("listitem", { name: `Line ${n}` });
const saveButton = () => screen.getByRole("button", { name: /save draft|retry save/i });
const headerTotal = () => within(screen.getByRole("banner")).getByText(/^\$/);
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** Answers everything the mixed fixture blocks on, so Save is enabled. */
async function resolveMixed(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(line(2)).getByRole("radio", { name: /^MS29513-033/ }));
  await user.type(screen.getByLabelText("Quantity for line 6"), "3");
  await user.click(within(line(7)).getByRole("button", { name: "Confirm 6" }));
  await user.click(within(line(7)).getByRole("radio", { name: /^Keep unmatched/ }));
}

function sentRequest(): SaveQuoteRequest {
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return JSON.parse(String(init?.body));
}

describe("ReviewScreen with the mixed fixture", () => {
  it("shows every line state, the notice, and the summary", () => {
    renderMixed();

    expect(screen.getByText("Earlier message replaced")).toBeTruthy();
    expect(within(line(1)).getByText("High")).toBeTruthy();
    expect(within(line(2)).getByText("Low")).toBeTruthy();
    expect(within(line(2)).getAllByRole("radio")).toHaveLength(4); // 3 candidates and Keep unmatched
    expect(within(line(3)).getByText("None")).toBeTruthy();
    expect(within(line(3)).getByText("Not in inventory")).toBeTruthy();
    expect(within(line(4)).getByText(/Short by 18/)).toBeTruthy();
    expect(within(line(5)).getByText("2 boxes of 100 = 200 EA")).toBeTruthy();
    expect(within(line(6)).getByText(/Can't convert "spools"/)).toBeTruthy();
    expect(within(line(7)).getByText(/isn't in this line's text/)).toBeTruthy();

    expect(screen.getByText("7 lines")).toBeTruthy();
    expect(screen.getByText("3 ready")).toBeTruthy();
    expect(screen.getByText("2 need a choice")).toBeTruthy();
    expect(screen.getByText("1 line quotes more than on hand")).toBeTruthy();
  });

  it("styles routine facts neutrally and warnings in amber, with words and icons", () => {
    renderMixed();
    const notInInventory = within(line(3)).getByText("None").closest("span")!;
    expect(notInInventory.className).toMatch(/neutral/);
    expect(notInInventory.className).not.toMatch(/red|amber|destructive/);
    expect(notInInventory.querySelector("svg")).not.toBeNull();

    const shortStock = within(line(4)).getByText(/Short by 18/).closest("div")!;
    expect(shortStock.className).toMatch(/amber/);
  });
});

describe("save gate", () => {
  it("blocks Save and says what is left, then enables it once every line is answered", async () => {
    const user = renderMixed();
    expect(saveButton()).toHaveProperty("disabled", true);
    expect(screen.getByText("To save: 2 lines need a choice, 1 line needs a quantity, 1 quantity to confirm.")).toBeTruthy();

    await user.click(within(line(2)).getByRole("radio", { name: /^MS29513-033/ }));
    await user.click(within(line(7)).getByRole("radio", { name: /^Keep unmatched/ }));
    await user.type(screen.getByLabelText("Quantity for line 6"), "3");
    expect(screen.getByText("To save: 1 quantity to confirm.")).toBeTruthy();
    expect(saveButton()).toHaveProperty("disabled", true);

    // A flagged quantity must be confirmed or edited, even when the line is otherwise decided.
    await user.click(within(line(7)).getByRole("button", { name: "Confirm 6" }));
    expect(saveButton()).toHaveProperty("disabled", false);
    expect(screen.queryByText(/^To save:/)).toBeNull();
  });

  it("counts editing a flagged quantity as answering it", async () => {
    const user = renderMixed();
    const quantity = screen.getByLabelText("Quantity for line 7");
    await user.clear(quantity);
    await user.type(quantity, "8");
    expect(within(line(7)).queryByRole("button", { name: /^Confirm/ })).toBeNull();
    expect(within(line(7)).getByText(/Quantity confirmed/)).toBeTruthy();
  });

  it("blocks a cleared quantity, an invalid markup, and an empty draft", async () => {
    const user = renderMixed();
    await resolveMixed(user);
    await user.clear(screen.getByLabelText("Quantity for line 1"));
    expect(screen.getByText("To save: 1 line needs a quantity.")).toBeTruthy();
    await user.type(screen.getByLabelText("Quantity for line 1"), "40");

    await user.clear(screen.getByRole("textbox", { name: "Markup" }));
    expect(screen.getByText("To save: set a markup from 0 to 1000%.")).toBeTruthy();
    expect(saveButton()).toHaveProperty("disabled", true);
  });

  it("jumps to the first line with something left to do", async () => {
    const user = renderMixed();
    await user.click(screen.getByRole("button", { name: "Go to line 2" }));
    expect(document.activeElement).toBe(within(line(2)).getAllByRole("radio")[0]);

    await user.click(within(line(2)).getByRole("radio", { name: /^MS29513-033/ }));
    await user.click(screen.getByRole("button", { name: "Go to line 6" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Quantity for line 6"));
  });
});

describe("pricing", () => {
  it("re-prices the line and the total when the quantity changes", async () => {
    const user = renderMixed();
    expect(within(line(1)).getByText(formatCents(unitPriceCents(461, 2500) * 40))).toBeTruthy();

    const quantity = screen.getByLabelText("Quantity for line 1");
    await user.clear(quantity);
    await user.type(quantity, "10");
    // The supplier was the automatic pick, so it follows the rule: Lakeshore can fill 10 for less.
    expect(within(line(1)).getByRole("combobox", { name: "Supplier for line 1" }).textContent).toBe("Lakeshore Precision");
    expect(within(line(1)).getByText(formatCents(unitPriceCents(337, 2500) * 10))).toBeTruthy();
    expect(within(line(1)).getByText("Cheapest supplier that can fill 10")).toBeTruthy();
  });

  it("re-prices every line and the total with unitPriceCents when the markup changes", async () => {
    const user = renderMixed();
    const priced = [
      { n: 1, cost: 461, qty: 40 },
      { n: 4, cost: 13569, qty: 50 },
      { n: 5, cost: 23, qty: 200 },
    ];
    const total = (bps: number) => priced.reduce((sum, l) => sum + unitPriceCents(l.cost, bps) * l.qty, 0);
    expect(headerTotal().textContent).toBe(formatCents(total(2500)));

    const markup = screen.getByRole("textbox", { name: "Markup" });
    await user.clear(markup);
    await user.type(markup, "12.5");

    for (const { n, cost, qty } of priced) {
      expect(within(line(n)).getByText(formatCents(unitPriceCents(cost, 1250)))).toBeTruthy();
      expect(within(line(n)).getByText(formatCents(unitPriceCents(cost, 1250) * qty))).toBeTruthy();
    }
    expect(headerTotal().textContent).toBe(formatCents(total(1250)));
    expect(screen.getByText("Total, excluding 3 unpriced lines")).toBeTruthy();
  });
});

describe("short stock", () => {
  it("quotes the supplier's on hand in one click, as an edit", async () => {
    const user = renderMixed();
    await user.click(within(line(4)).getByRole("button", { name: "Quote 32 on hand" }));
    expect(screen.getByLabelText("Quantity for line 4")).toHaveProperty("value", "32");
    expect(within(line(4)).queryByText(/Short by/)).toBeNull();
    expect(within(line(4)).getByText("Edited")).toBeTruthy();
    expect(screen.queryByText(/more than on hand/)).toBeNull();
  });

  it("warns but offers no Quote on hand when the supplier has 0 on hand", async () => {
    const user = renderMixed();
    await user.click(within(line(4)).getByRole("combobox", { name: "Supplier for line 4" }));
    await user.click(await screen.findByRole("option", { name: /Harbor Point Industrial/ }));

    expect(within(line(4)).getByText(/Short by 50: Harbor Point Industrial has 0 on hand/)).toBeTruthy();
    expect(within(line(4)).queryByRole("button", { name: /Quote .* on hand/ })).toBeNull();
    expect(within(line(4)).getByText("0")).toBeTruthy();
  });
});

describe("saving", () => {
  it("sends decisions, quantities, edits, and the markup, with no prices", async () => {
    fetchMock.mockResolvedValue(json(201, { quoteId }));
    const user = renderMixed();
    await resolveMixed(user);
    await user.click(within(line(1)).getByRole("combobox", { name: "Supplier for line 1" }));
    await user.click(await screen.findByRole("option", { name: /Lakeshore Precision/ }));
    await user.click(within(line(3)).getByRole("button", { name: "Remove line 3" }));
    await user.click(saveButton());

    expect(fetchMock).toHaveBeenCalledWith("/api/quotes", expect.objectContaining({ method: "POST" }));
    const request = sentRequest();
    expect(request).toMatchObject({ extractionId, markupBps: 2500 });
    expect(request.lines.map((l) => [l.partNumber, l.supplier, l.quantity, l.edited])).toEqual([
      ["AL14720-1", "Lakeshore Precision", 40, true],
      ["MS29513-033", "Delta Wire & Cable", 12, true],
      ["M39029/41-861", "Ironclad Industrial Supply", 50, false],
      ["MS21044-243P", "Vanguard Aviation Spares", 200, false],
      ["M22759/13-12-3", "Copperline Electronics", 3, true],
      [null, null, 6, false],
    ]);
    expect(JSON.stringify(request)).not.toMatch(/price|cost/i);
    expect(push).toHaveBeenCalledWith(`/quotes/${quoteId}`);
  });

  it("links to the existing draft when the extraction was already saved", async () => {
    fetchMock.mockResolvedValue(json(409, { code: "ALREADY_SAVED", quoteId }));
    const user = renderMixed();
    await resolveMixed(user);
    await user.click(saveButton());

    expect((await screen.findByRole("link", { name: "View draft" })).getAttribute("href")).toBe(`/quotes/${quoteId}`);
    expect(saveButton()).toHaveProperty("disabled", true);
    expect(push).not.toHaveBeenCalled();
  });

  it.each([
    ["the 501 stub", () => Promise.resolve(json(501, { error: "Not implemented" })), /server answered 501/],
    ["an HTML error page", () => Promise.resolve(new Response("<html>oops</html>", { status: 500 })), /server answered 500/],
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch")), /Couldn't save, your edits are still here\.$/],
  ])("keeps the edits and offers Retry after %s", async (_label, respond, message) => {
    fetchMock.mockImplementationOnce(respond);
    const user = renderMixed();
    await resolveMixed(user);
    await user.click(saveButton());

    expect((await screen.findByRole("alert")).textContent).toMatch(message);
    expect(screen.getByLabelText("Quantity for line 6")).toHaveProperty("value", "3");

    fetchMock.mockResolvedValueOnce(json(201, { quoteId }));
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    expect(push).toHaveBeenCalledWith(`/quotes/${quoteId}`);
  });

  it("names the lines whose offer is gone", async () => {
    fetchMock.mockResolvedValue(json(409, { code: "OFFER_MISSING", linePositions: [0, 3] }));
    const user = renderMixed();
    await resolveMixed(user);
    await user.click(saveButton());
    expect((await screen.findByRole("alert")).textContent).toContain("the offer for lines 1, 4 is no longer in inventory");
  });

  it("keeps review state out of storage that other tabs share", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    fetchMock.mockResolvedValue(json(201, { quoteId }));
    const user = renderMixed();
    await resolveMixed(user);
    await user.type(screen.getByRole("textbox", { name: "Markup" }), "0");
    await user.click(saveButton());
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe("adding and removing lines", () => {
  const washer: Candidate = {
    partNumber: "AN960C10L",
    nsn: null,
    description: "WASHER,FLAT",
    kind: "part_number",
    score: 1,
    reason: "Exact part number match",
    offers: [{ supplier: "Tri-County Fastener", qtyOnHand: 500, unitCostCents: 12, leadTimeDays: 7 }],
  };

  it("removes a line and renumbers the rest", async () => {
    const user = renderMixed();
    await user.click(screen.getByRole("button", { name: "Remove line 1" }));
    expect(screen.getAllByRole("listitem", { name: /^Line / })).toHaveLength(6);
    expect(within(line(1)).getByText("2. MS29513-034 o-ring, 12 ea")).toBeTruthy();
    expect(screen.getByText("6 lines")).toBeTruthy();
  });

  it("adds an unmatched line as free text and asks for its quantity", async () => {
    const user = renderMixed();
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByRole("searchbox", { name: "Search inventory for a new line" }), "Bracket per drawing 7");
    await user.click(screen.getByRole("button", { name: "Add unmatched" }));

    expect(within(line(8)).getByText("Bracket per drawing 7")).toBeTruthy();
    expect(within(line(8)).getByText("Added")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Quantity for line 8"));
  });

  it("adds a line from an inventory search, priced", async () => {
    fetchMock.mockResolvedValue(json(200, { candidates: [washer] }));
    const user = renderMixed();
    await user.click(screen.getByRole("button", { name: "Add line" }));
    await user.type(screen.getByRole("searchbox", { name: "Search inventory for a new line" }), "AN960{Enter}");
    await user.click(await screen.findByRole("button", { name: "Use AN960C10L" }));
    await user.type(screen.getByLabelText("Quantity for line 8"), "100");

    expect(fetchMock).toHaveBeenCalledWith("/api/parts?q=AN960", expect.anything());
    expect(within(line(8)).getByText(formatCents(unitPriceCents(12, 2500) * 100))).toBeTruthy();
  });

  it("picks a part found by search for a line not in inventory", async () => {
    fetchMock.mockResolvedValue(json(200, { candidates: [washer] }));
    const user = renderMixed();
    await user.type(within(line(3)).getByRole("searchbox"), "washer{Enter}");
    await user.click(await within(line(3)).findByRole("button", { name: "Use AN960C10L" }));

    expect(within(line(3)).getByRole("radio", { name: /^AN960C10L/ })).toHaveProperty("checked", true);
    expect(within(line(3)).getByText(formatCents(unitPriceCents(12, 2500) * 2))).toBeTruthy();
  });

  it("says when inventory search is unavailable, and still allows keeping the line unmatched", async () => {
    fetchMock.mockResolvedValue(json(501, { error: "Not implemented" }));
    const user = renderMixed();
    await user.type(within(line(2)).getByRole("searchbox"), "o-ring{Enter}");
    expect(await within(line(2)).findByText("Inventory search isn't available right now.")).toBeTruthy();
    await user.click(within(line(2)).getByRole("radio", { name: /^Keep unmatched/ }));
    expect(screen.getByText("To save: 1 line needs a choice, 1 line needs a quantity, 1 quantity to confirm.")).toBeTruthy();
  });
});

describe("other fixtures", () => {
  it("renders the clean fixture ready to save", () => {
    const { emailText, seed } = reviewFixtures.cleanEmail;
    render(<ReviewScreen extractionId={extractionId} emailText={emailText} seed={seed} />);
    expect(screen.getByText("3 ready")).toBeTruthy();
    expect(saveButton()).toHaveProperty("disabled", false);
  });

  it("renders the no-items fixture with its notice, the email, and the add-line search", () => {
    const { emailText, seed } = reviewFixtures.noItemsEmail;
    render(<ReviewScreen extractionId={extractionId} emailText={emailText} seed={seed} />);
    expect(screen.getByText("No items requested")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Original email" }).textContent).toContain("out of the office");
    expect(screen.getByRole("searchbox", { name: "Search inventory for a new line" })).toBeTruthy();
    expect(screen.getByText("To save: add at least one line.")).toBeTruthy();
  });

  it("renders the email as plain text, never as HTML", () => {
    const emailText = "<img src=x onerror=alert(1)> <b>bold</b>";
    render(<ReviewScreen extractionId={extractionId} emailText={emailText} seed={{ lines: [], notices: [] }} />);
    expect(screen.getByRole("complementary", { name: "Original email" }).textContent).toContain(emailText);
    expect(document.querySelector("img")).toBeNull();
  });
});
