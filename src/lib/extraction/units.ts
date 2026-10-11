/**
 * Units the model reports as written, converted to each with a fixed table (EXT-6).
 * Inventory is all "each", so anything this table doesn't know goes to the rep to confirm
 * rather than being guessed.
 */

const EACH = new Set(["", "each", "ea", "pc", "pcs", "piece", "pieces"]);

const FIXED = new Map([
  ["dz", 12],
  ["doz", 12],
  ["dozen", 12],
  ["dozens", 12],
  ["hd", 100],
  ["hundred", 100],
  ["hundreds", 100],
]);

// Containers whose size varies, so they convert only with a pack size stated in the email.
const PACKS = new Set(["box", "boxes", "bx", "pack", "packs", "pk", "pkg", "pkgs", "package", "packages", "pg"]);

export type UnitConversion =
  | { kind: "each" }
  | { kind: "converted"; perUnit: number }
  | { kind: "unknown"; reason: "unrecognized" | "pack_size_missing" };

/** How many each one `unit` holds. A null or blank unit means each. */
export function convertUnit(unit: string | null, packSize: number | null): UnitConversion {
  const key = (unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (EACH.has(key)) return { kind: "each" };
  const fixed = FIXED.get(key);
  if (fixed !== undefined) return { kind: "converted", perUnit: fixed };
  if (PACKS.has(key)) {
    return packSize === null ? { kind: "unknown", reason: "pack_size_missing" } : { kind: "converted", perUnit: packSize };
  }
  return { kind: "unknown", reason: "unrecognized" };
}
