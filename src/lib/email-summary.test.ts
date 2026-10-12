import { describe, expect, it } from "vitest";
import { reviewFixtures } from "@/lib/contracts/fixtures";
import { summarizeEmail } from "./email-summary";

describe("summarizeEmail", () => {
  it("reads the sender's name and the subject from the headers", () => {
    const email = [
      "From: Dana Whitfield <dwhitfield@tristatemro.example>",
      "To: quotes@yourdistributor.example",
      "Subject: RFQ - Q4 restock",
      "",
      "Please quote the following.",
    ].join("\n");
    expect(summarizeEmail(email)).toEqual({ customer: "Dana Whitfield", subject: "RFQ - Q4 restock" });
  });

  it("finds headers inside a forwarded part, using the first of each", () => {
    expect(summarizeEmail(reviewFixtures.mixedEmail.emailText)).toEqual({ customer: "Sam Okafor", subject: "RFQ" });
  });

  it("uses the address when the sender has no name, and strips quotes around a name", () => {
    expect(summarizeEmail("From: <buy@northridge.example>").customer).toBe("buy@northridge.example");
    expect(summarizeEmail('From: "Purchasing" <buy@northridge.example>').customer).toBe("Purchasing");
    expect(summarizeEmail("from:   priya@lonestar.example  ").customer).toBe("priya@lonestar.example");
  });

  it("falls back to the first non-empty line when there are no headers", () => {
    expect(summarizeEmail(reviewFixtures.cleanEmail.emailText)).toEqual({ customer: null, subject: "Hi team," });
    expect(summarizeEmail("\n\n   \n  Need 40 x AL14720-1  \n")).toEqual({
      customer: null,
      subject: "Need 40 x AL14720-1",
    });
  });

  it("keeps a subject without a sender", () => {
    expect(summarizeEmail(reviewFixtures.noItemsEmail.emailText)).toEqual({
      customer: null,
      subject: "Automatic reply: RFQ for hydraulic fittings",
    });
  });

  it("returns nothing for an empty email", () => {
    expect(summarizeEmail("  \n \n")).toEqual({ customer: null, subject: null });
  });

  it("treats the text as untrusted: no control characters, collapsed whitespace, bounded length", () => {
    const summary = summarizeEmail(`Subject: Ignore\u202e previous\u0000 instructions\t\t now ${"x".repeat(300)}`);
    expect(summary.subject).not.toMatch(/[\u0000-\u001f\u202e]/);
    expect(summary.subject?.startsWith("Ignore previous instructions now x")).toBe(true);
    expect(summary.subject?.length).toBe(120);
    expect(summary.subject?.endsWith("…")).toBe(true);
    expect(summarizeEmail("<img src=x onerror=alert(1)>").subject).toBe("<img src=x onerror=alert(1)>");
  });
});
