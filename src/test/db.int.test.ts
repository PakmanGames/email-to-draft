import { describe, expect, it } from "vitest";
import { part } from "@/lib/db/schema";
import { setupTestDb } from "./db";

const db = setupTestDb();

// These two run in order: the second proves the first's rows were truncated.
describe("setupTestDb", () => {
  it("lets a test write rows", async () => {
    await db.insert(part).values({ partNumber: "AN3-9D", description: "NUT" });
    expect(await db.$count(part)).toBe(1);
  });

  it("starts the next test with empty tables", async () => {
    expect(await db.$count(part)).toBe(0);
  });

  it("points at this run's test database, not the dev database", async () => {
    const { rows } = await db.$client.query<{ name: string }>("SELECT current_database() AS name");
    expect(rows[0].name).toMatch(/^rfq_test_[0-9a-f]{8}$/);
  });
});
