// Display formatting for saved drafts. Money stays integer cents everywhere else; dividing
// here is for display only and is exact to the cent for any realistic amount.

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });

/** 229125 -> "$2,291.25" */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Basis points as a percentage: 2500 -> "25%", 1250 -> "12.5%". */
export function formatMarkup(bps: number): string {
  return percent.format(bps / 10_000);
}
