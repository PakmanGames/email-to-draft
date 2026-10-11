import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QuoteSummary } from "@/lib/contracts";
import { formatCents, formatMarkup } from "./format";
import { LocalDateTime } from "./local-date-time";

/** The drafts list (SAVE-3): one row per saved draft, newest first. */
export function QuotesTable({ quotes }: { quotes: QuoteSummary[] }) {
  if (quotes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-12 text-center">
        <p className="font-medium">No drafts yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Drafts appear here after you review an email and save it.{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-4">
            Paste an email
          </Link>{" "}
          to start one.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Saved</TableHead>
          <TableHead className="text-right">Lines</TableHead>
          <TableHead className="text-right">Unmatched</TableHead>
          <TableHead className="text-right">Short stock</TableHead>
          <TableHead className="text-right">Markup</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {quotes.map((quote) => (
          // The link's ::after covers the row, so the whole row opens the draft.
          <TableRow key={quote.id} className="relative">
            <TableCell>
              <Link
                href={`/quotes/${quote.id}`}
                className="font-medium underline-offset-4 outline-none after:absolute after:inset-0 hover:underline focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
              >
                <LocalDateTime iso={quote.createdAt.toISOString()} />
                <span className="sr-only">, open draft</span>
              </Link>
            </TableCell>
            <TableCell className="text-right">{quote.lineCount}</TableCell>
            <TableCell className="text-right">{quote.unmatchedCount}</TableCell>
            <TableCell className="text-right">
              <ShortStockCount count={quote.shortStockCount} />
            </TableCell>
            <TableCell className="text-right">{formatMarkup(quote.markupBps)}</TableCell>
            <TableCell className="text-right font-medium">{formatCents(quote.totalCents)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Short stock is a warning, not an error (PRD principle 3): amber, with an icon and words.
function ShortStockCount({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
      <TriangleAlert aria-hidden className="size-3.5" />
      {count}
      <span className="sr-only">{count === 1 ? "line quotes" : "lines quote"} more than on hand</span>
    </span>
  );
}

/** Stands in for the table while the drafts load. */
export function QuotesTableSkeleton() {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading drafts">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
