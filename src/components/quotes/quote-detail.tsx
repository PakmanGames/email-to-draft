import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuoteDetail, QuoteLine } from "@/lib/contracts";
import { isShortStock } from "@/lib/quotes/short-stock";
import { cn } from "@/lib/utils";
import { formatCents, formatMarkup } from "./format";
import { LocalDateTime } from "./local-date-time";

const head = "h-8 px-3 text-left text-caption font-semibold whitespace-nowrap text-muted-foreground";
const cell = "px-3 py-2.5 align-top";

/**
 * A saved draft, read-only (SAVE-3). Every value is the snapshot taken at save time, so
 * this page never reflects later inventory changes.
 */
export function QuoteDetailView({ quote }: { quote: QuoteDetail }) {
  const shortCount = quote.lines.filter(isShortStock).length;
  const unpricedCount = quote.lines.filter((line) => line.unitPriceCents === null).length;

  return (
    <div className="space-y-5 px-5 py-5">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl bg-card px-5 py-4 shadow-card sm:grid-cols-4">
        <Fact label="Saved">
          <LocalDateTime iso={quote.createdAt.toISOString()} />
        </Fact>
        <Fact label="Lines">{quote.lines.length}</Fact>
        <Fact label="Markup">{formatMarkup(quote.markupBps)}</Fact>
        <Fact label="Total">{formatCents(quote.totalCents)}</Fact>
        <Fact label="Extraction" className="col-span-full">
          {/* The trace view (FAIL-7) is P1, so this is plain text until it exists. */}
          <span className="font-mono text-footnote font-normal text-muted-foreground">{quote.extractionId}</span>
        </Fact>
      </dl>

      {shortCount > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-surface px-3.5 py-2.5">
          <TriangleAlert aria-hidden className="mt-px size-4 shrink-0 text-warning" />
          <div className="text-warning-foreground">
            <p className="font-semibold">
              {shortCount === 1 ? "1 line quotes" : `${shortCount} lines quote`} more than on hand
            </p>
            <p className="text-footnote">
              {shortCount === 1 ? "It is" : "They are"} quoted at the requested quantity, which is more than the
              supplier had when this draft was saved.
            </p>
          </div>
        </div>
      )}

      {quote.lines.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
          This draft has no lines.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card shadow-card">
          <table className="w-full border-collapse text-body">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(head, "w-8 pl-4 text-right")}>#</th>
                <th className={head}>Item</th>
                <th className={cn(head, "text-right")}>Qty</th>
                <th className={head}>Supplier</th>
                <th className={cn(head, "text-right")}>Unit Price</th>
                <th className={cn(head, "pr-4 text-right")}>Extended</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {quote.lines.map((line) => (
                <LineRow key={line.position} line={line} />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/60">
                <td colSpan={4} className="px-4 py-2.5 text-footnote text-muted-foreground">
                  {unpricedCount > 0 &&
                    `${unpricedCount} unpriced ${unpricedCount === 1 ? "line is" : "lines are"} not included in the total.`}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold">Total</td>
                <td className="py-2.5 pr-4 pl-3 text-right font-semibold tabular-nums">{formatCents(quote.totalCents)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Fact({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <dt className="text-footnote text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

const DASH = <span className="text-faint-foreground">—</span>;

/** Laid out like a line on the review screen, so a saved draft reads the way it was built. */
function LineRow({ line }: { line: QuoteLine }) {
  const short = isShortStock(line);
  return (
    <tr className="border-b border-border last:border-0">
      <td className={cn(cell, "pl-4 text-right text-muted-foreground")}>{line.position + 1}</td>
      <td className={cn(cell, "w-full")}>
        {line.partNumber === null ? (
          // Routine, not an error (PRD principle 3): neutral styling.
          <p className="text-muted-foreground">Unmatched</p>
        ) : (
          <p>
            <span className="font-mono font-semibold">{line.partNumber}</span>{" "}
            <span className="text-muted-foreground">{line.description}</span>
          </p>
        )}
        <p className="font-mono text-footnote break-words text-muted-foreground">
          <span className="sr-only">Requested: </span>
          {line.requestedText}
        </p>
      </td>
      <td className={cn(cell, "text-right whitespace-nowrap")}>
        {line.quantity}
        {short && line.qtyOnHand !== null && (
          <div className="mt-0.5 flex items-center justify-end gap-1 text-footnote font-medium text-warning-foreground">
            <TriangleAlert aria-hidden className="size-3 text-warning" />
            Short by {line.quantity - line.qtyOnHand}
          </div>
        )}
      </td>
      <td className={cn(cell, "min-w-40")}>
        {line.supplier === null ? (
          DASH
        ) : (
          <>
            <p>{line.supplier}</p>
            <p className="text-footnote whitespace-nowrap text-muted-foreground">
              {line.qtyOnHand} on hand · {line.leadTimeDays} {line.leadTimeDays === 1 ? "day" : "days"} lead
            </p>
          </>
        )}
      </td>
      <td className={cn(cell, "text-right whitespace-nowrap")}>
        {line.unitPriceCents === null || line.unitCostCents === null ? (
          DASH
        ) : (
          <>
            {formatCents(line.unitPriceCents)}
            <div className="text-footnote text-muted-foreground">Cost {formatCents(line.unitCostCents)}</div>
          </>
        )}
      </td>
      <td className={cn(cell, "pr-4 text-right font-semibold whitespace-nowrap")}>
        {line.unitPriceCents === null ? DASH : formatCents(line.unitPriceCents * line.quantity)}
      </td>
    </tr>
  );
}

/** Stands in for the draft while it loads. */
export function QuoteDetailSkeleton() {
  return (
    <div className="space-y-5 px-5 py-5" aria-busy aria-label="Loading draft">
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}
