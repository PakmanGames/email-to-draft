import { describe, expect, it } from "vitest";
import { part } from "@/lib/db/schema";
import { setupTestDb } from "@/test/db";
import { partNumberKey } from "./identifiers";

const db = setupTestDb();

describe("partNumberKey", () => {
  it("agrees with the part.part_number_key generated column", async () => {
    // Trimmed and non-empty, because part_number's CHECK requires it.
    const inputs = [
      "ms29513-033",
      "M83248/1-317",
      "an3.9d",
      "D38999/26JC82SA",
      "AN3–9D", // en dash
      "AN3 9D", // non-breaking space, which btrim keeps
      "a b/c.d_e\tf",
      "é1",
      "ı1",
      "straße",
      "ﬁx-1",
      "１２３-4",
      "---",
    ];
    await db.insert(part).values(inputs.map((partNumber) => ({ partNumber, description: "test" })));

    const rows = await db.select({ partNumber: part.partNumber, key: part.partNumberKey }).from(part);

    expect(rows).toHaveLength(inputs.length);
    for (const row of rows) {
      expect(partNumberKey(row.partNumber), row.partNumber).toBe(row.key);
    }
  });
});
