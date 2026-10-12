import { ChevronRight, Files, SquarePen, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuoteSummary } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { draftTitle, formatCents, formatMarkup } from "./format";
import { LocalDateTime } from "./local-date-time";

const head = "h-8 px-3 text-left text-caption font-semibold whitespace-nowrap text-muted-foreground";
const cell = "px-3 py-2 align-middle whitespace-nowrap";

/**
 * The drafts list (SAVE-3), newest first, as a Mac table: each row names the customer and
 * subject from the email, and the whole row opens the draft.
 */
export function QuotesTable({ quotes }: { quotes: QuoteSummary[] }) {
  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-20 text-center">
        <Files aria-hidden className="size-10 text-faint-foreground" strokeWidth={1.5} />
        <p className="mt-3 text-headline font-semibold">No Drafts</p>
        <p className="mt-1 max-w-xs text-footnote text-balance text-muted-foreground">
          When you review a customer&apos;s email and save it, the draft appears here.
        </p>
        <Link href="/" className={cn(buttonVariants(), "mt-4")}>
          <SquarePen aria-hidden />
          New Quote
        </Link>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-body">
      <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
        <tr className="border-b border-border">
          <th className={cn(head, "pl-5")}>Customer</th>
          <th className={head}>Saved</th>
          <th className={cn(head, "text-right")}>Lines</th>
          <th className={cn(head, "text-right")}>Unmatched</th>
          <th className={cn(head, "text-right")}>Short Stock</th>
          <th className={cn(head, "text-right")}>Markup</th>
          <th className={cn(head, "text-right")}>Total</th>
          <th className="w-9 pr-3">
            <span className="sr-only">Open</span>
          </th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {quotes.map((quote) => (
          // The link's ::after covers the row, so the whole row opens the draft.
          <tr key={quote.id} className="relative border-b border-border hover:bg-hover">
            <td className={cn(cell, "max-w-0 w-full pl-5 whitespace-normal")}>
              <Link
                href={`/quotes/${quote.id}`}
                className="block truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/45 focus-visible:after:ring-inset"
              >
                {draftTitle(quote)}
              </Link>
              {quote.customer && quote.subject && (
                <p className="truncate text-footnote text-muted-foreground">{quote.subject}</p>
              )}
            </td>
            <td className={cn(cell, "text-muted-foreground")}>
              <LocalDateTime iso={quote.createdAt.toISOString()} />
            </td>
            <td className={cn(cell, "text-right")}>{quote.lineCount}</td>
            <td className={cn(cell, "text-right", quote.unmatchedCount === 0 && "text-faint-foreground")}>
              {quote.unmatchedCount}
            </td>
            <td className={cn(cell, "text-right")}>
              <ShortStockCount count={quote.shortStockCount} />
            </td>
            <td className={cn(cell, "text-right text-muted-foreground")}>{formatMarkup(quote.markupBps)}</td>
            <td className={cn(cell, "text-right font-semibold")}>{formatCents(quote.totalCents)}</td>
            <td className="pr-3 text-faint-foreground">
              <ChevronRight aria-hidden className="size-4" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Short stock is a warning, not an error (PRD principle 3): amber, with an icon and words.
function ShortStockCount({ count }: { count: number }) {
  if (count === 0) return <span className="text-faint-foreground">0</span>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-warning-foreground">
      <TriangleAlert aria-hidden className="size-3.5 text-warning" />
      {count}
      <span className="sr-only">{count === 1 ? "line quotes" : "lines quote"} more than on hand</span>
    </span>
  );
}

/** Stands in for the table while the drafts load. */
export function QuotesTableSkeleton() {
  return (
    <div className="space-y-3 px-5 py-4" aria-busy aria-label="Loading drafts">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
