const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const whole = new Intl.NumberFormat("en-US");

/** Integer cents as dollars: 57650 → "$576.50". Display only; sums stay in integer cents. */
export function formatCents(cents: number): string {
  return money.format(cents / 100);
}

/** A whole number with thousands separators: 1500 → "1,500". */
export function formatCount(n: number): string {
  return whole.format(n);
}

/** "1 line", "2 lines". */
export function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}
