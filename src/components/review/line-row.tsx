"use client";

import { Check, ChevronDown, Info, TriangleAlert, X } from "lucide-react";
import { useState, type Dispatch, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { formatCents, formatCount } from "./format";
import { PartPicker } from "./part-picker";
import type { LineView, ReviewAction } from "./review-model";
import { SupplierSelect } from "./supplier-select";

/** Column template shared by the header row and every line, so the columns line up. */
export const LINE_GRID =
  "grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4.75rem_5.25rem_5.75rem_1.75rem] gap-x-3";

type Props = { view: LineView; markupBps: number; dispatch: Dispatch<ReviewAction> };

/**
 * One requested line (technical design section 8): what the customer wrote, the match with
 * its confidence and reason, the supplier, and the numbers. High lines stay compact. Lines
 * that need a decision show the part picker, which can't be collapsed until they get one.
 */
export function LineRow({ view, markupBps, dispatch }: Props) {
  const { line, number, part, offer, quantityIssue, needsChoice } = view;
  const confidence = line.seed?.match.confidence ?? null;
  const [expanded, setExpanded] = useState(() => needsChoice || confidence === "none");
  const showPicker = expanded || needsChoice;
  const key = line.key;
  const hasWarnings =
    view.shortBy > 0 || view.quantityWarnings.length > 0 || view.otherWarnings.length > 0;

  let status: ReactNode;
  if (part) {
    status = (
      <>
        <span className="font-mono font-semibold text-neutral-900">{part.partNumber}</span>{" "}
        <span className="text-neutral-600">{part.description}</span>
      </>
    );
  } else if (line.selection?.kind === "unmatched") {
    status = (
      <span className="text-neutral-700">
        {confidence === "none" ? "Not in inventory" : "Unmatched"}
        <span className="text-neutral-500"> · not priced</span>
      </span>
    );
  } else {
    status = <span className="text-neutral-700">Pick a part below</span>;
  }

  const hasCandidates = line.candidates.length > 0;
  const toggleLabel = showPicker
    ? hasCandidates ? "Hide options" : "Hide search"
    : hasCandidates ? "Change part" : "Find a part";

  // The reason belongs to the match. Skip it where the status line already says the same.
  const reason = line.seed?.match.reason;
  const showReason = reason && !(confidence === "none" && !part && reason === "Not in inventory");

  return (
    <li id={`line-${key}`} aria-label={`Line ${number}`} className={cn(LINE_GRID, "gap-y-2 px-3 py-2.5")}>
      <div className="text-xs leading-7 text-neutral-400 tabular-nums">{number}</div>

      <div className="min-w-0 space-y-1">
        <p className="font-mono text-xs leading-5 break-words whitespace-pre-wrap text-neutral-500">
          <span className="sr-only">Requested: </span>
          {line.requestedText}
        </p>

        <div className="flex min-w-0 items-start gap-2">
          <ConfidenceBadge confidence={confidence} />
          <p className="min-w-0 text-[13px] leading-5 break-words">{status}</p>
        </div>

        <p className="text-xs leading-5 text-neutral-500">
          {[
            showReason && reason,
            view.edited && line.seed && <span className="text-neutral-400">Edited</span>,
            !needsChoice && (
              <button
                type="button"
                aria-expanded={showPicker}
                onClick={() => setExpanded(!expanded)}
                className="inline-flex items-center gap-0.5 rounded font-medium text-neutral-700 hover:text-neutral-950 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none"
              >
                {toggleLabel}
                <ChevronDown aria-hidden className={cn("size-3.5 transition-transform", showPicker && "rotate-180")} />
              </button>
            ),
          ]
            .filter(Boolean)
            .map((item, i) => (
              <span key={i}>
                {i > 0 && <span aria-hidden> · </span>}
                {item}
              </span>
            ))}
        </p>

        {part && offer && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <SupplierSelect
              offers={part.offers}
              supplier={offer.supplier}
              markupBps={markupBps}
              label={`Supplier for line ${number}`}
              onChange={(supplier) => dispatch({ type: "pickSupplier", key, supplier })}
            />
            {line.supplierReason && <span className="text-xs text-neutral-500">{line.supplierReason}</span>}
          </div>
        )}
      </div>

      <div>
        <input
          id={`line-${key}-qty`}
          aria-label={`Quantity for line ${number}`}
          aria-invalid={quantityIssue === "missing"}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Qty"
          value={line.quantityText}
          onChange={(event) => dispatch({ type: "setQuantity", key, text: event.target.value })}
          className={cn(
            "h-7 w-full rounded-md border bg-white px-2 text-right text-[13px] text-neutral-900 tabular-nums shadow-xs outline-none placeholder:text-neutral-400 focus-visible:ring-2",
            quantityIssue
              ? "border-amber-400 bg-amber-50 focus-visible:ring-amber-400/40"
              : "border-neutral-200 focus-visible:border-neutral-400 focus-visible:ring-neutral-400/30",
          )}
        />
      </div>

      <NumberCell
        primary={offer ? formatCount(offer.qtyOnHand) : null}
        secondary={offer && `${offer.leadTimeDays} d lead`}
        srLabel="on hand"
      />
      <NumberCell
        primary={view.unitPriceCents !== null ? formatCents(view.unitPriceCents) : null}
        secondary={offer && `cost ${formatCents(offer.unitCostCents)}`}
        srLabel="unit price"
      />
      <NumberCell
        primary={view.extendedCents !== null ? formatCents(view.extendedCents) : null}
        placeholder={line.selection?.kind === "unmatched" ? "Excluded" : undefined}
        srLabel="extended"
        strong
      />

      <div>
        <button
          type="button"
          aria-label={`Remove line ${number}`}
          title="Remove line"
          onClick={() => dispatch({ type: "removeLine", key })}
          className="grid size-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      {/* Below the line and as wide as the number columns, so candidates and warnings don't wrap. */}
      {(hasWarnings || showPicker) && (
        <div className="col-span-5 col-start-2 space-y-1.5">
          <LineWarnings view={view} dispatch={dispatch} />
          {showPicker && (
            <PartPicker
              view={view}
              markupBps={markupBps}
              onPick={(candidate) => dispatch({ type: "pickPart", key, candidate })}
              onKeepUnmatched={() => dispatch({ type: "keepUnmatched", key })}
            />
          )}
        </div>
      )}
    </li>
  );
}

function NumberCell({
  primary,
  secondary,
  placeholder,
  srLabel,
  strong,
}: {
  primary: string | null;
  secondary?: string | null;
  placeholder?: string;
  srLabel: string;
  strong?: boolean;
}) {
  if (primary === null) {
    return (
      <p className="text-right text-xs leading-7 text-neutral-400">
        <span className="sr-only">{srLabel}: </span>
        {placeholder ?? "—"}
      </p>
    );
  }
  return (
    <div className="text-right tabular-nums">
      <p className={cn("text-[13px] leading-7 text-neutral-900", strong && "font-medium")}>
        <span className="sr-only">{srLabel}: </span>
        {primary}
      </p>
      {secondary && <p className="text-xs leading-4 text-neutral-500">{secondary}</p>}
    </div>
  );
}

/**
 * Short stock and extraction warnings, in amber. A converted unit is a routine note in neutral
 * text, as is a flag the rep already answered (PRD principle 3).
 */
function LineWarnings({ view, dispatch }: { view: LineView; dispatch: Dispatch<ReviewAction> }) {
  const { line, offer, shortBy, quantity, quantityIssue } = view;
  const key = line.key;
  return (
    <>
      {offer && shortBy > 0 && (
        <Callout>
          Short by {formatCount(shortBy)}: {offer.supplier} has {formatCount(offer.qtyOnHand)} on hand.
          {offer.qtyOnHand > 0 && (
            <CalloutButton onClick={() => dispatch({ type: "quoteOnHand", key })}>
              Quote {formatCount(offer.qtyOnHand)} on hand
            </CalloutButton>
          )}
        </Callout>
      )}

      {view.quantityWarnings.map((warning) =>
        line.quantityConfirmed ? (
          <Note key={warning.code} icon={<Check aria-hidden className="size-3.5 text-neutral-500" />}>
            Quantity confirmed. {warning.message}
          </Note>
        ) : (
          <Callout key={warning.code}>
            {warning.message}
            {quantityIssue === "unconfirmed" && quantity !== null && (
              <CalloutButton onClick={() => dispatch({ type: "confirmQuantity", key })}>
                Confirm {formatCount(quantity)}
              </CalloutButton>
            )}
          </Callout>
        ),
      )}

      {view.otherWarnings.map((warning) =>
        warning.code === "UNIT_CONVERTED" ? (
          <Note key={warning.code} icon={<Info aria-hidden className="size-3.5 text-neutral-400" />}>
            {warning.message}
          </Note>
        ) : (
          <Callout key={warning.code}>{warning.message}</Callout>
        ),
      )}
    </>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs leading-5 text-amber-900 ring-1 ring-amber-600/20 ring-inset">
      <TriangleAlert aria-hidden className="mt-[3px] size-3.5 shrink-0 text-amber-600" />
      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

function CalloutButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-2 inline-flex h-5 items-center rounded border border-amber-300 bg-white px-1.5 align-baseline text-xs font-medium text-amber-900 hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 px-0.5 text-xs leading-5 text-neutral-500">
      <span className="mt-[3px] shrink-0">{icon}</span>
      <p className="min-w-0">{children}</p>
    </div>
  );
}
