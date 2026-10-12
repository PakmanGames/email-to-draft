/**
 * Where a line's source text sits in the email, for highlighting it (REV-8), as
 * [start, end) offsets, or null when it can't be found.
 *
 * The model copies `source_text` verbatim, but may collapse runs of whitespace or line
 * breaks (a table row, a line wrapped in the email). So an exact match comes first, then a
 * match that treats any run of whitespace as equal.
 */
export function findSourceRange(emailText: string, sourceText: string): [number, number] | null {
  const needle = sourceText.trim();
  if (needle === "") return null;

  const exact = emailText.indexOf(needle);
  if (exact !== -1) return [exact, exact + needle.length];

  const words = needle.split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = new RegExp(words.join("\\s+")).exec(emailText);
  return match ? [match.index, match.index + match[0].length] : null;
}
