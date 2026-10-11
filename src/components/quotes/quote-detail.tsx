import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { QuoteDetail, QuoteLine } from "@/lib/contracts";
import { isShortStock } from "@/lib/quotes/short-stock";
import { formatCents, formatMarkup } from "./format";
import { LocalDateTime } from "./local-date-time";

/**
 * A saved draft, read-only (SAVE-3). Every value is the snapshot taken at save time, so
 * this page never reflects later inventory changes.
 */
export function QuoteDetailView({ quote }: { quote: QuoteDetail }) {
  const shortCount = quote.lines.filter(isShortStock).length;
  const unpricedCount = quote.lines.filter((line) => line.unitPriceCents === null).length;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <Fact label="Saved">
          <LocalDateTime iso={quote.createdAt.toISOString()} />
        </Fact>
        <Fact label="Lines">{quote.lines.length}</Fact>
        <Fact label="Markup">{formatMarkup(quote.markupBps)}</Fact>
        <Fact label="Total">{formatCents(quote.totalCents)}</Fact>
        <Fact label="Extraction" className="col-span-full">
          {/* The trace view (FAIL-7) is P1, so this is plain text until it exists. */}
          <span className="font-mono text-xs">{quote.extractionId}</span>
        </Fact>
      </dl>

      {shortCount > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            {shortCount === 1 ? "1 line quotes" : `${shortCount} lines quote`} more than on hand
          </AlertTitle>
          <AlertDescription className="text-amber-900 dark:text-amber-200">
            {shortCount === 1 ? "It is" : "They are"} quoted at the requested quantity, which is more than the
            supplier had when this draft was saved.
          </AlertDescription>
        </Alert>
      )}

      {quote.lines.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          This draft has no lines.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 text-right">#</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Part</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Lead time</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Extended</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {quote.lines.map((line) => (
              <LineRow key={line.position} line={line} />
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="text-muted-foreground font-normal">
                {unpricedCount > 0 &&
                  `${unpricedCount} unpriced ${unpricedCount === 1 ? "line is" : "lines are"} not included in the total.`}
              </TableCell>
              <TableCell className="text-right">Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatCents(quote.totalCents)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </div>
  );
}

function Fact({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{children}</dd>
    </div>
  );
}

const DASH = <span className="text-muted-foreground">—</span>;

function LineRow({ line }: { line: QuoteLine }) {
  const short = isShortStock(line);
  return (
    // Top-aligned so each cell's main value sits on one line when others wrap or add a note.
    <TableRow className="*:align-top">
      <TableCell className="text-right text-muted-foreground">{line.position + 1}</TableCell>
      <TableCell className="max-w-56 whitespace-normal break-words">{line.requestedText}</TableCell>
      <TableCell className="max-w-64 whitespace-normal">
        {line.partNumber === null ? (
          // Routine, not an error (PRD principle 3): neutral styling.
          <span className="text-muted-foreground">Unmatched</span>
        ) : (
          <>
            <div className="font-medium">{line.partNumber}</div>
            <div className="text-xs text-muted-foreground">{line.description}</div>
          </>
        )}
      </TableCell>
      <TableCell className="whitespace-normal">{line.supplier ?? DASH}</TableCell>
      <TableCell className="text-right">
        {line.quantity}
        {short && line.qtyOnHand !== null && (
          <div className="mt-0.5 flex items-center justify-end gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            <TriangleAlert aria-hidden className="size-3" />
            Short by {line.quantity - line.qtyOnHand}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">{line.qtyOnHand ?? DASH}</TableCell>
      <TableCell className="text-right">
        {line.leadTimeDays === null ? DASH : `${line.leadTimeDays} ${line.leadTimeDays === 1 ? "day" : "days"}`}
      </TableCell>
      <TableCell className="text-right">
        {line.unitPriceCents === null || line.unitCostCents === null ? (
          DASH
        ) : (
          <>
            {formatCents(line.unitPriceCents)}
            <div className="text-xs text-muted-foreground">Cost {formatCents(line.unitCostCents)}</div>
          </>
        )}
      </TableCell>
      <TableCell className="text-right font-medium">
        {line.unitPriceCents === null ? DASH : formatCents(line.unitPriceCents * line.quantity)}
      </TableCell>
    </TableRow>
  );
}

/** Stands in for the draft while it loads. */
export function QuoteDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading draft">
      <Skeleton className="h-28 w-full" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
