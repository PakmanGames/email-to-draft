import type { QuoteLine } from "@/lib/contracts";

/**
 * A line is short on stock when it quotes more than its supplier had on hand at save time
 * (REV-10, SAVE-3). That is a warning, never an error: the quantity is still quoted.
 * Unmatched lines have no on-hand figure and are never short. `listQuotes` counts the
 * same rule in SQL. Kept apart from ./index.ts so UI code can use it without the database.
 */
export function isShortStock(line: Pick<QuoteLine, "quantity" | "qtyOnHand">): boolean {
  return line.qtyOnHand !== null && line.quantity > line.qtyOnHand;
}
