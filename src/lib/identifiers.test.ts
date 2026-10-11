import { describe, expect, it } from "vitest";
import { normalizeNsn, partNumberKey } from "./identifiers";

describe("normalizeNsn", () => {
  it.each([
    ["5310-01-449-0355", "5310-01-449-0355"],
    ["5310014490355", "5310-01-449-0355"],
    ["5310 01 449 0355", "5310-01-449-0355"],
    ["5310.01.449.0355", "5310-01-449-0355"],
    ["5310-01-4490355", "5310-01-449-0355"],
    ["531-001-4490-355", "5310-01-449-0355"],
    ["NSN 5310-01-449-0355", "5310-01-449-0355"],
    ["NSN: 5310-01-449-0355", "5310-01-449-0355"],
    ["NSN:5310014490355", "5310-01-449-0355"],
    ["NSN5310014490355", "5310-01-449-0355"],
    ["nsn 5310-01-449-0355", "5310-01-449-0355"],
    ["Nsn : 5310 01 449 0355", "5310-01-449-0355"],
    ["  5310-01-449-0355\t", "5310-01-449-0355"],
    ["5310–01–449–0355", "5310-01-449-0355"], // en dashes
  ])("normalizes %j", (raw, expected) => {
    expect(normalizeNsn(raw)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["NSN", "prefix only"],
    ["5310-01-449-035", "12 digits"],
    ["5310-01-449-03555", "14 digits"],
    ["449-0355", "NIIN fragment"],
    ["014490355", "9-digit NIIN"],
    ["5310-01-449-0355A", "trailing letter"],
    ["MS29513-033", "part number"],
    ["NSN 5310-01-449-0355 and 5310-01-449-0356", "two NSNs"],
    ["NSNX5310014490355", "letter after prefix"],
    ["5310-01-449-0355 NSN", "prefix at the end"],
    ["5310-01-449-0355 é", "non-ASCII letter"],
    ["５３１０-０１-４４９-０３５５", "full-width digits"],
  ])("rejects %j (%s)", (raw) => {
    expect(normalizeNsn(raw)).toBeNull();
  });
});

describe("partNumberKey", () => {
  it.each([
    ["MS29513-033", "MS29513033"],
    ["ms29513-033", "MS29513033"],
    [" ms 29513 / 033 ", "MS29513033"],
    ["M83248/1-317", "M832481317"],
    ["AN3-9D", "AN39D"],
    ["an3.9d", "AN39D"],
    ["D38999/26JC82SA", "D3899926JC82SA"],
    ["AN3–9D", "AN39D"], // en dash
    ["AN3 9D", "AN39D"], // non-breaking space
    ["", ""],
    ["---", ""],
    ["é1", "1"], // uppercases to a non-ASCII letter, then stripped
    ["ı1", "I1"], // dotless i uppercases to ASCII I
    ["straße", "STRAE"], // ß is not expanded to SS, as in Postgres
    ["ﬁx", "X"], // nor is the fi ligature
    ["１２３", ""], // full-width digits are not [0-9]
  ])("keys %j as %j", (raw, expected) => {
    expect(partNumberKey(raw)).toBe(expected);
  });

  it("is idempotent", () => {
    for (const raw of ["MS29513-033", "an3.9d", "straße"]) {
      expect(partNumberKey(partNumberKey(raw))).toBe(partNumberKey(raw));
    }
  });
});
