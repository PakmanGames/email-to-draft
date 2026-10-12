"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, CircleX, Ellipsis, Info, TriangleAlert } from "lucide-react";
import { useState, type Dispatch, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import { ConfidenceBadge } from "./confidence-badge";
import { formatCents, formatCount } from "./format";
import { PartPicker } from "./part-picker";
import type { LineView, ReviewAction } from "./review-model";
import { SupplierSelect } from "./supplier-select";

/**
 * Column template shared by the header row and every line, so the columns line up. The
 * supplier column widens when the lines area has room (a container query on the area, since
 * the email pane changes its width independently of the window).
 */
export const LINE_GRID =
  "grid grid-cols-[minmax(0,1fr)_4rem_9rem_5.25rem_5.25rem_1.5rem] gap-x-3 @4xl/lines:grid-cols-[minmax(0,1fr)_4.5rem_12rem_5.5rem_6rem_1.5rem] @4xl/lines:gap-x-4";

type Props = {
  view: LineView;
  markupBps: number;
  dispatch: Dispatch<ReviewAction>;
  /** The line the rep is working on: it takes Tab focus, and its source is highlighted. */
  active: boolean;
  /** Saving said this line's offer is gone from inventory (OFFER_MISSING). */
  offerGone: boolean;
  onActivate: () => void;
  onHover: (hovering: boolean) => void;
  rowRef: Ref<HTMLLIElement>;
};

/**
 * One requested line (technical design 8). Two rows to scan: what was matched with its
 * confidence and the numbers, then what the customer wrote and why it matched. Warnings
 * follow as compact pills. A line that needs a decision shows its candidates inline,
 * and can't hide them until it gets one.
 */
export function LineRow({ view, markupBps, dispatch, active, offerGone, onActivate, onHover, rowRef }: Props) {
  const { line, number, part, offer, quantityIssue, needsChoice } = view;
  const confidence = line.seed?.match.confidence ?? null;
  const [expanded, setExpanded] = useState(() => needsChoice || confidence === "none");
  const showPicker = expanded || needsChoice;
  const key = line.key;

  let match: ReactNode;
  if (part) {
    // The part number never truncates; the description gives way first.
    match = (
      <>
        <span className="shrink-0 font-mono font-semibold">{part.partNumber}</span>
        <span className="min-w-0 truncate text-muted-foreground" title={part.description}>
          {part.description}
        </span>
      </>
    );
  } else if (line.selection?.kind === "unmatched") {
    match = <span className="text-muted-foreground">{confidence === "none" ? "Not in inventory" : "Unmatched"}</span>;
  } else {
    match = <span className="font-medium">Choose a part</span>;
  }

  // A None line's reason is "Not in inventory", which the match column already says, and
  // next to a part found by search it would read as a contradiction.
  const reason = confidence === "none" ? null : (line.seed?.match.reason ?? null);
  const pills = linePills(view, dispatch, offerGone);

  return (
    <li
      ref={rowRef}
      id={`line-${key}`}
      aria-label={`Line ${number}`}
      tabIndex={active ? 0 : -1}
      data-active={active || undefined}
      onFocus={onActivate}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        LINE_GRID,
        "scroll-my-12 gap-y-2 px-5 py-2.5 outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/45 focus-visible:ring-inset data-active:bg-selection",
      )}
    >
      <div className="min-w-0">
        <p className="flex h-6 min-w-0 items-center gap-2 text-body">
          <ConfidenceBadge confidence={confidence} />
          {match}
        </p>
        <p className="truncate text-footnote text-muted-foreground" title={line.requestedText}>
          <span className="sr-only">Requested: </span>
          <span className="font-mono">{line.requestedText}</span>
          {reason && <span> · {reason}</span>}
          {view.edited && line.seed && <span className="text-faint-foreground"> · Edited</span>}
        </p>
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
            "h-6 w-full rounded-md border bg-background px-2 text-right text-body tabular-nums shadow-xs outline-none placeholder:text-faint-foreground focus-visible:ring-3",
            quantityIssue
              ? "border-warning-border bg-warning-surface focus-visible:ring-warning/40"
              : "border-input focus-visible:ring-ring/45",
          )}
        />
      </div>

      <div className="min-w-0">
        {part && offer ? (
          <>
            <SupplierSelect
              offers={part.offers}
              supplier={offer.supplier}
              markupBps={markupBps}
              label={`Supplier for line ${number}`}
              onChange={(supplier) => dispatch({ type: "pickSupplier", key, supplier })}
            />
            <p
              className="truncate text-footnote text-muted-foreground tabular-nums"
              title={line.supplierReason ?? undefined}
            >
              {formatCount(offer.qtyOnHand)} on hand · {offer.leadTimeDays} d lead
            </p>
          </>
        ) : (
          <Dash />
        )}
      </div>

      <div className="text-right tabular-nums">
        {view.unitPriceCents !== null && offer ? (
          <>
            <p className="leading-6">
              <span className="sr-only">Unit price: </span>
              {formatCents(view.unitPriceCents)}
            </p>
            <p className="text-footnote whitespace-nowrap text-muted-foreground">cost {formatCents(offer.unitCostCents)}</p>
          </>
        ) : (
          <Dash />
        )}
      </div>

      <div className="text-right tabular-nums">
        {view.extendedCents !== null ? (
          <p className="leading-6 font-semibold">
            <span className="sr-only">Extended: </span>
            {formatCents(view.extendedCents)}
          </p>
        ) : line.selection?.kind === "unmatched" ? (
          <p className="text-footnote leading-6 text-muted-foreground">Excluded</p>
        ) : (
          <Dash />
        )}
      </div>

      <LineMenu
        number={number}
        partOptionsOpen={showPicker}
        canHideOptions={!needsChoice}
        hasCandidates={line.candidates.length > 0}
        onToggleOptions={() => setExpanded(!showPicker)}
        onRemove={() => dispatch({ type: "removeLine", key })}
      />

      {(pills.length > 0 || showPicker) && (
        <div className="col-span-5 space-y-2">
          {pills.length > 0 && <div className="flex flex-wrap gap-1.5">{pills}</div>}
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

function Dash() {
  return (
    <p aria-hidden className="text-right text-body leading-6 text-faint-foreground">
      —
    </p>
  );
}

/**
 * Short stock, extraction flags, and a gone offer, as compact pills with their action
 * inline. Amber marks short stock and quantity warnings. A converted unit, or a flag the
 * rep already answered, is a quiet neutral note (PRD principle 3).
 */
function linePills(view: LineView, dispatch: Dispatch<ReviewAction>, offerGone: boolean): ReactNode[] {
  const { line, offer, shortBy, quantity, quantityIssue } = view;
  const key = line.key;
  const pills: ReactNode[] = [];

  if (offerGone && offer) {
    pills.push(
      <Pill key="offer-gone" tone="error" icon={<CircleX />}>
        {offer.supplier} no longer has this part. Pick another supplier or part.
      </Pill>,
    );
  }
  if (offer && shortBy > 0) {
    pills.push(
      <Pill key="short" tone="warning" icon={<TriangleAlert />}>
        Short by {formatCount(shortBy)}
        {offer.qtyOnHand > 0 && (
          <PillAction onClick={() => dispatch({ type: "quoteOnHand", key })}>
            Quote {formatCount(offer.qtyOnHand)} on Hand
          </PillAction>
        )}
      </Pill>,
    );
  }
  for (const warning of view.quantityWarnings) {
    pills.push(
      line.quantityConfirmed ? (
        <Pill key={warning.code} tone="neutral" icon={<Check />} title={warning.message}>
          Quantity confirmed
        </Pill>
      ) : (
        <Pill key={warning.code} tone="warning" icon={<TriangleAlert />}>
          {warning.message}
          {quantityIssue === "unconfirmed" && quantity !== null && (
            <PillAction onClick={() => dispatch({ type: "confirmQuantity", key })}>
              Confirm {formatCount(quantity)}
            </PillAction>
          )}
        </Pill>
      ),
    );
  }
  for (const warning of view.otherWarnings) {
    pills.push(
      warning.code === "UNIT_CONVERTED" ? (
        <Pill key={warning.code} tone="neutral" icon={<Info />}>
          {warning.message}
        </Pill>
      ) : (
        <Pill key={warning.code} tone="warning" icon={<TriangleAlert />}>
          {warning.message}
        </Pill>
      ),
    );
  }
  return pills;
}

const pillTones = {
  warning: "border-warning-border bg-warning-surface text-warning-foreground [&>svg]:text-warning",
  error: "border-destructive/30 bg-destructive/8 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
};

function Pill({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof pillTones;
  icon: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border py-0.5 pr-1 pl-2 text-footnote [&>svg]:size-3.5 [&>svg]:shrink-0",
        tone === "neutral" && "pr-2.5",
        pillTones[tone],
      )}
    >
      {icon}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function PillAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1.5 inline-flex h-5 items-center rounded-full bg-background px-2 align-middle text-footnote font-medium text-foreground shadow-xs ring-1 ring-warning-border hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/45 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

function LineMenu({
  number,
  partOptionsOpen,
  canHideOptions,
  hasCandidates,
  onToggleOptions,
  onRemove,
}: {
  number: number;
  partOptionsOpen: boolean;
  canHideOptions: boolean;
  hasCandidates: boolean;
  onToggleOptions: () => void;
  onRemove: () => void;
}) {
  const itemClass =
    "flex h-6 cursor-default items-center rounded-[5px] px-2.5 text-body outline-none select-none data-highlighted:bg-primary data-highlighted:text-primary-foreground";
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Actions for line ${number}`}
        className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/45 data-popup-open:bg-accent"
      >
        <Ellipsis aria-hidden className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
          <Menu.Popup className="min-w-44 origin-[var(--transform-origin)] rounded-lg bg-popover p-1 text-popover-foreground shadow-float outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            {(!partOptionsOpen || canHideOptions) && (
              <Menu.Item className={itemClass} onClick={onToggleOptions}>
                {partOptionsOpen ? "Hide Part Options" : hasCandidates ? "Change Part…" : "Find a Part…"}
              </Menu.Item>
            )}
            <Menu.Item className={itemClass} onClick={onRemove}>
              Remove Line
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
