import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppSidebar, AppSidebarView, type SidebarDraft } from "./app-sidebar";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const recent: SidebarDraft[] = [
  { id: "0b6f3c2e-5f8a-4d1b-9c3e-7a2d4e6f8a10", title: "Sam Okafor", createdAt: "2026-10-11T22:49:00Z", totalCents: 877_821 },
  { id: "1c7a4d3f-6a9b-4e2c-8d4f-8b3e5f7a9b21", title: "Dana Whitfield", createdAt: "2026-10-10T15:05:00Z", totalCents: 9594 },
];

const selected = () => screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
const names = (links: HTMLElement[]) => links.map((link) => link.textContent);

beforeEach(() => {
  pathname = "/";
});

describe("AppSidebar", () => {
  it.each([
    ["/", "New Quote"],
    ["/review/00000000-0000-4000-8000-000000000002", "New Quote"],
    ["/quotes", "Drafts12"],
  ])("selects exactly one item on %s", (path, item) => {
    pathname = path;
    render(<AppSidebar recent={recent} draftCount={12} />);
    expect(names(selected())).toEqual([item]);
  });

  it("selects an open draft in Recent Drafts, or Drafts when it isn't listed there", () => {
    pathname = `/quotes/${recent[1].id}`;
    const { unmount } = render(<AppSidebar recent={recent} draftCount={12} />);
    expect(selected()).toHaveLength(1);
    expect(selected()[0].getAttribute("href")).toBe(`/quotes/${recent[1].id}`);
    unmount();

    pathname = "/quotes/7d1e5a6c-3a51-4b8e-9a43-2f0f5b6c1d20";
    render(<AppSidebar recent={recent} draftCount={12} />);
    expect(names(selected())).toEqual(["Drafts12"]);
  });

  it("names recent drafts by customer or subject, with their total", () => {
    render(<AppSidebar recent={recent} draftCount={2} />);
    const draft = screen.getByRole("link", { name: /Sam Okafor/ });
    expect(draft.getAttribute("href")).toBe(`/quotes/${recent[0].id}`);
    expect(within(draft).getByText("$8,778.21")).toBeDefined();
  });

  it("always offers New Quote and Drafts, whatever state the drafts are in", () => {
    render(<AppSidebar recent={[]} draftCount={0} />);
    expect(screen.getByRole("link", { name: "New Quote" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /^Drafts/ }).getAttribute("href")).toBe("/quotes");
    expect(screen.getByText("Saved drafts appear here.")).toBeDefined();
  });

  it("says when drafts couldn't be loaded, and still navigates", () => {
    render(<AppSidebar recent={[]} draftCount={null} failed />);
    expect(screen.getByText("Drafts couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole("link", { name: "Drafts" })).toBeDefined();
  });

  it("selects nothing in the prerendered shell, before the path is known", () => {
    render(<AppSidebarView recent={null} draftCount={null} pathname={null} />);
    expect(selected()).toHaveLength(0);
    expect(screen.getByLabelText("Loading recent drafts")).toBeDefined();
  });
});
