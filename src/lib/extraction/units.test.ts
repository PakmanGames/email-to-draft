import { describe, expect, it } from "vitest";
import { convertUnit } from "./units";

describe("convertUnit", () => {
  it.each([null, "", "  ", "each", "EA", "ea.", "pc", "PCS", "piece", "Pieces"])("treats %j as each", (unit) => {
    expect(convertUnit(unit, null)).toEqual({ kind: "each" });
  });

  it.each([
    ["dz", 12],
    ["DOZ.", 12],
    ["dozen", 12],
    ["Dozens", 12],
    ["hd", 100],
    ["HD", 100],
    ["hundred", 100],
    ["hundreds", 100],
  ])("converts %j at a fixed %i each", (unit, perUnit) => {
    expect(convertUnit(unit, null)).toEqual({ kind: "converted", perUnit });
  });

  it("ignores a pack size on a fixed unit", () => {
    expect(convertUnit("dozen", 50)).toEqual({ kind: "converted", perUnit: 12 });
  });

  it.each(["box", "Boxes", "bx", "pack", "PACKS", "pk", "pkg", "pkgs", "package", "packages", "PG"])(
    "converts %j with the stated pack size",
    (unit) => {
      expect(convertUnit(unit, 25)).toEqual({ kind: "converted", perUnit: 25 });
    },
  );

  it("can't convert a pack without a pack size", () => {
    expect(convertUnit("boxes", null)).toEqual({ kind: "unknown", reason: "pack_size_missing" });
  });

  it.each(["rolls", "ft", "pair", "kit", "lot", "constructor"])("doesn't guess at %j", (unit) => {
    expect(convertUnit(unit, 10)).toEqual({ kind: "unknown", reason: "unrecognized" });
  });
});
