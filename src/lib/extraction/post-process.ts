import type { ExtractedLine, LineWarning, LlmExtraction, LlmLineItem, Notice } from "@/lib/contracts";
import { normalizeNsn, partNumberKey } from "@/lib/identifiers";
import { convertUnit } from "./units";

/**
 * Deterministic checks on validated model output (technical design 6, step 7). The model
 * is untrusted (PRD principle 2), so nothing it returns reaches matching or the rep
 * without passing through here.
 */
export function postProcess(emailText: string, extraction: LlmExtraction): { lines: ExtractedLine[]; notices: Notice[] } {
  const email = { key: partNumberKey(emailText), flat: collapseWhitespace(emailText) };
  const lines: ExtractedLine[] = [];
  extraction.line_items.forEach((item, index) => {
    const line = processItem(item, index, email);
    if (line) lines.push(line);
  });

  const notices: Notice[] = [];
  if (extraction.line_items.length === 0) {
    notices.push({ code: "NO_ITEMS", message: NO_ITEMS_MESSAGES[extraction.no_items_reason ?? "other"] });
  }
  const discarded = extraction.line_items.length - lines.length;
  if (discarded > 0) {
    const message =
      discarded === 1
        ? "Discarded 1 line the model returned, because nothing in it was found in the email."
        : `Discarded ${discarded} lines the model returned, because nothing in them was found in the email.`;
    notices.push({ code: "LINES_DISCARDED", message });
  }
  const supersededNote = clean(extraction.superseded_note);
  if (supersededNote) {
    notices.push({ code: "SUPERSEDED", message: `A later message in this thread changes the request: ${supersededNote}` });
  }
  return { lines, notices };
}

const NO_ITEMS_MESSAGES: Record<NonNullable<LlmExtraction["no_items_reason"]>, string> = {
  auto_reply: "This looks like an automatic reply, so there is nothing to quote.",
  attachment_only: "The request seems to be in an attachment, and attachments aren't read. Add the lines by hand.",
  no_request: "This email doesn't ask for any parts.",
  other: "No requested items were found in this email.",
};

type EmailText = { key: string; flat: string };

/** One model line item to an `ExtractedLine`, or null when nothing in it is grounded. */
function processItem(item: LlmLineItem, index: number, email: EmailText): ExtractedLine | null {
  const warnings: LineWarning[] = [];
  const sourceText = item.source_text.trim();
  const description = clean(item.description);

  // Identifiers must appear in the email. Comparing [A-Z0-9] keys forgives the model
  // reformatting dashes, spaces, or case, but not inventing or completing an identifier.
  const keep = (value: string | null, key: (value: string) => string, label: string): string | null => {
    if (value === null) return null;
    const valueKey = key(value);
    if (valueKey !== "" && email.key.includes(valueKey)) return value;
    warnings.push({
      code: "IDENTIFIER_DROPPED",
      message: `Ignored a ${label} the model returned that is not in the email: "${value}".`,
    });
    return null;
  };
  const writtenPartNumber = clean(item.part_number);
  const writtenNsn = clean(item.nsn);
  const partNumber = keep(writtenPartNumber, partNumberKey, "part number");
  const nsnAsWritten = keep(writtenNsn, nsnKey, "NSN");
  if (partNumber === null && nsnAsWritten === null && description === null) return null;

  // Each line against its own text. An identifier that is in the email but not in this
  // line's text usually means the model paired one line's part with another line's quantity.
  const sourceKey = partNumberKey(sourceText);
  const identifiersInSource =
    (partNumber === null || sourceKey.includes(partNumberKey(partNumber))) &&
    (nsnAsWritten === null || sourceKey.includes(nsnKey(nsnAsWritten)));
  const sourceInEmail = sourceText !== "" && email.flat.includes(collapseWhitespace(sourceText));
  if (!sourceInEmail || !identifiersInSource) {
    warnings.push({
      code: "LINE_NOT_GROUNDED",
      message: "Couldn't confirm this line against the email text. Check the part and quantity.",
    });
  }

  let nsn: string | null = null;
  if (nsnAsWritten !== null) {
    nsn = normalizeNsn(nsnAsWritten);
    if (nsn === null) {
      warnings.push({
        code: "NSN_INVALID",
        message: `"${nsnAsWritten}" is not a valid NSN (13 digits), so it isn't used for matching.`,
      });
    }
  }

  const { quantityEach, quantityAsWritten } = quantityOf(item, sourceText, [writtenPartNumber, writtenNsn], warnings);
  return { index, sourceText, partNumber, nsn, description, quantityEach, quantityAsWritten, warnings };
}

function quantityOf(
  item: LlmLineItem,
  sourceText: string,
  identifiers: (string | null)[],
  warnings: LineWarning[],
): { quantityEach: number | null; quantityAsWritten: string } {
  const { quantity, pack_size: packSize } = item;
  const unit = clean(item.unit);
  if (quantity === null) {
    warnings.push({ code: "QTY_MISSING", message: "The email doesn't give a quantity for this line. Enter one." });
    return { quantityEach: null, quantityAsWritten: "" };
  }
  const quantityAsWritten = [String(quantity), unit, packSize === null ? null : `of ${packSize}`]
    .filter((part) => part !== null)
    .join(" ");

  // Blank out the identifiers first, so a digit inside a part number or NSN can't vouch
  // for a quantity the model made up.
  const text = identifiers.reduce<string>((rest, id) => (id ? rest.replaceAll(id, " ") : rest), sourceText);
  const quantityFound = numberInText(quantity, text);
  const packSizeFound = packSize === null || numberInText(packSize, text);
  if (!quantityFound || !packSizeFound) {
    const what =
      quantityFound ? `Pack size ${packSize} doesn't`
      : packSizeFound ? `Quantity ${quantity} doesn't`
      : `Quantity ${quantity} and pack size ${packSize} don't`;
    warnings.push({ code: "QTY_NOT_IN_TEXT", message: `${what} appear in this line's text. Confirm the quantity.` });
  }

  const conversion = convertUnit(unit, packSize);
  if (conversion.kind === "each") return { quantityEach: quantity, quantityAsWritten };
  if (conversion.kind === "converted") {
    const quantityEach = quantity * conversion.perUnit;
    warnings.push({ code: "UNIT_CONVERTED", message: `${quantityAsWritten} = ${quantityEach} EA` });
    return { quantityEach, quantityAsWritten };
  }
  warnings.push({
    code: "UNIT_UNKNOWN",
    message:
      conversion.reason === "pack_size_missing"
        ? `Couldn't convert "${quantityAsWritten}" to each without a pack size. Confirm the quantity.`
        : `Couldn't convert "${quantityAsWritten}" to each. Confirm the quantity.`,
  });
  return { quantityEach: null, quantityAsWritten };
}

const NUMBER_WORDS = new Map([
  ["a", 1],
  ["an", 1],
  ...["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"].map(
    (word, i) => [word, i + 1] as const,
  ),
]);

/**
 * Whether `n` is written in `text`, as digits (thousands separators allowed) or as a small
 * number word, so "a dozen" (quantity 1) and "1,500" (quantity 1500) both count.
 */
function numberInText(n: number, text: string): boolean {
  const digits = text.replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
  if (new RegExp(`(?<![0-9])${n}(?![0-9])`).test(digits)) return true;
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).some((word) => NUMBER_WORDS.get(word) === n);
}

/** NSNs are compared by their 13 digits, so an "NSN" prefix the email didn't have isn't a mismatch. */
function nsnKey(nsn: string): string {
  return normalizeNsn(nsn)?.replaceAll("-", "") ?? partNumberKey(nsn);
}

function clean(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
