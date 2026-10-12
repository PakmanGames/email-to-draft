import type { Candidate } from "@/lib/contracts";
import { unitPriceCents } from "@/lib/pricing";
import { formatCents, formatCount, plural } from "./format";

/**
 * One candidate part: identity, why it was suggested, and its offers at a glance. "Up to N on
 * hand" is the largest single offer, because a line is never split across suppliers (REV-4).
 */
export function CandidateSummary({ candidate, markupBps }: { candidate: Candidate; markupBps: number }) {
  const mostOnHand = Math.max(...candidate.offers.map((o) => o.qtyOnHand));
  const lowestCost = Math.min(...candidate.offers.map((o) => o.unitCostCents));
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-body break-words">
          <span className="font-mono font-semibold">{candidate.partNumber}</span>{" "}
          <span className="text-muted-foreground">{candidate.description}</span>
        </p>
        <p className="text-footnote text-muted-foreground">
          {candidate.reason}
          {candidate.nsn && <span className="whitespace-nowrap"> · NSN {candidate.nsn}</span>}
        </p>
      </div>
      <p className="shrink-0 text-right text-footnote text-muted-foreground tabular-nums">
        {plural(candidate.offers.length, "supplier", "suppliers")} · up to {formatCount(mostOnHand)} on hand
        <br />
        from {formatCents(unitPriceCents(lowestCost, markupBps))}
      </p>
    </div>
  );
}
