const NSN_PREFIX = /^\s*NSN\s*:?/i;

/**
 * Normalizes an NSN as written in an email to `####-##-###-####`.
 *
 * Accepts exactly 13 digits with any separators (dashes, spaces, dots, none) and an
 * optional "NSN" or "NSN:" prefix, in any case. Returns null for anything else,
 * including any other letters, so a part number is never mistaken for an NSN.
 */
export function normalizeNsn(raw: string): string | null {
  const body = raw.replace(NSN_PREFIX, "");
  if (/\p{L}/u.test(body)) return null;
  const digits = body.replace(/[^0-9]/g, "");
  if (digits.length !== 13) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * The part number matching key: uppercase, `[A-Z0-9]` only.
 *
 * Must agree with the `part.part_number_key` generated column,
 * `regexp_replace(upper(part_number), '[^A-Z0-9]', '', 'g')`. Postgres uppercases one
 * character at a time, so "ß" stays "ß" (and is then stripped) where JavaScript's
 * `toUpperCase()` would expand it to "SS". Dropping multi-character expansions keeps
 * the two in step.
 */
export function partNumberKey(raw: string): string {
  let key = "";
  for (const char of raw) {
    const upper = char.toUpperCase();
    if (upper.length === 1 && /[A-Z0-9]/.test(upper)) key += upper;
  }
  return key;
}
