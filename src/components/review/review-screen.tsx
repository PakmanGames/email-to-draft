"use client";

import { CircleCheck, ChevronRight, LoaderCircle, PanelRight, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { hasShortcutModifier, Shortcut } from "@/components/shell/shortcut";
import { Toolbar } from "@/components/shell/toolbar";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { Candidate, ReviewSeed } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { EmailPane } from "./email-pane";
import { formatCents, plural } from "./format";
import { LINE_GRID, LineRow } from "./line-row";
import { Notices } from "./notices";
import { PartSearch } from "./part-search";
import {
  buildSaveRequest,
  describeBlockers,
  initReviewState,
  nextBlocked,
  reviewReducer,
  summarize,
  viewLine,
  type BlockedTarget,
  type LineFilter,
  type LineView,
  type ReviewSummary,
} from "./review-model";
import { postQuote } from "./save-draft";

type Props = { extractionId: string; emailText: string; title: string; seed: ReviewSeed };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "alreadySaved"; quoteId: string }
  /** Line key → the "part|supplier" sent for it, so a line clears once the rep changes it. */
  | { status: "offerMissing"; gone: Map<string, string> }
  | { status: "rejected" }
  | { status: "extractionMissing" }
  | { status: "failed"; httpStatus: number | null };

type FocusRequest = (BlockedTarget | { key: string; target: "row" }) & { nonce: number };

const saveLabel: Record<SaveState["status"], string> = {
  idle: "Save Draft",
  saving: "Saving",
  saved: "Saved",
  alreadySaved: "Save Draft",
  offerMissing: "Save Draft",
  rejected: "Save Draft",
  extractionMissing: "Save Draft",
  // PRD section 6: "Couldn't save, your edits are still here" with Retry.
  failed: "Retry Save",
};

const filterLabels: Record<LineFilter, string> = {
  all: "All",
  attention: "Needs Attention",
  ready: "Ready",
  unmatched: "Unmatched",
};

const selectionOf = (view: LineView) =>
  view.line.selection?.kind === "part" ? `${view.line.selection.partNumber}|${view.line.selection.supplier}` : "";

/**
 * The review screen (technical design section 8, REV-1 to REV-10). All review state lives in
 * this component's reducer, so it is per tab and gone on reload: nothing is shared with other
 * tabs (EXT-4). Render it with `key={extractionId}` so a different extraction starts fresh.
 */
export function ReviewScreen({ extractionId, emailText, title, seed }: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reviewReducer, seed, initReviewState);
  const views = useMemo(
    () => state.lines.map((line, i) => viewLine(line, i, state.markupBps)),
    [state.lines, state.markupBps],
  );
  const summary = summarize(state, views);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [adding, setAdding] = useState(seed.lines.length === 0);

  // null follows the window: beside the lines from 1280px, hidden below. With no lines the
  // rep types them from the email, so it starts open at any width.
  const [emailOpen, setEmailOpen] = useState<boolean | null>(seed.lines.length === 0 ? true : null);
  const wide = useMediaQuery("(min-width: 80rem)");
  const emailVisible = emailOpen ?? wide;

  // The filter keeps showing a line the rep just fixed, until they pick a filter again,
  // so a row never vanishes under the cursor (like Mail's Unread filter).
  const [filter, setFilter] = useState<LineFilter>("all");
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const visible = filter === "all" ? views : views.filter((v) => v.status === filter || pinned.has(v.line.key));

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const active = visible.find((v) => v.line.key === activeKey) ?? visible[0] ?? null;
  const highlighted = views.find((v) => v.line.key === hoverKey) ?? active;
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  const next = nextBlocked(views, active?.line.key ?? null);
  const locked =
    save.status === "saving" ||
    save.status === "saved" ||
    save.status === "alreadySaved" ||
    save.status === "extractionMissing";

  useEffect(() => {
    if (!focusRequest) return;
    const { key, target } = focusRequest;
    const element = document.getElementById(
      target === "choice" ? `line-${key}-choice` : target === "quantity" ? `line-${key}-qty` : `line-${key}`,
    );
    const focusable =
      element instanceof HTMLInputElement || element instanceof HTMLLIElement ? element : element?.querySelector("input");
    focusable?.focus({ preventScroll: true });
    focusable?.scrollIntoView?.({ block: "nearest" });
  }, [focusRequest]);

  function chooseFilter(value: LineFilter) {
    setFilter(value);
    setPinned(new Set(views.filter((v) => v.status === value).map((v) => v.line.key)));
  }

  function goTo(target: BlockedTarget | { key: string; target: "row" }) {
    if (!visible.some((v) => v.line.key === target.key)) setFilter("all");
    setFocusRequest({ ...target, nonce: Date.now() });
  }

  async function handleSave() {
    if (!summary.canSave || locked) return;
    setSave({ status: "saving" });
    const sent = views.map((view) => [view.line.key, selectionOf(view)] as const);
    const outcome = await postQuote(buildSaveRequest(extractionId, state, views));
    switch (outcome.kind) {
      case "created":
        setSave({ status: "saved" });
        router.push(`/quotes/${outcome.quoteId}`);
        // The sidebar lists recent drafts, and the shared layout isn't re-rendered by a push.
        router.refresh();
        break;
      case "alreadySaved":
        setSave({ status: "alreadySaved", quoteId: outcome.quoteId });
        break;
      case "offerMissing":
        setSave({ status: "offerMissing", gone: new Map(outcome.linePositions.map((p) => sent[p]).filter(Boolean)) });
        break;
      case "rejected":
        // The save gate should make this impossible, so keep the server's reason for tracing.
        console.error("POST /api/quotes rejected the draft:", outcome.message);
        setSave({ status: "rejected" });
        break;
      case "extractionMissing":
        setSave({ status: "extractionMissing" });
        break;
      case "failed":
        setSave({ status: "failed", httpStatus: outcome.httpStatus });
        break;
    }
  }

  // ⌘S saves when the gate allows it, and otherwise takes the rep to what is left.
  const saveShortcut = useRef(() => {});
  useEffect(() => {
    saveShortcut.current = () => {
      if (summary.canSave) void handleSave();
      else if (next) goTo(next);
    };
  });
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== "s" || !hasShortcutModifier(event) || event.shiftKey || event.altKey) return;
      event.preventDefault();
      saveShortcut.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /** j/k and the arrow keys move between lines, except where a control needs those keys. */
  function onLinesKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement;
    const radio = target instanceof HTMLInputElement && target.type === "radio";
    if ((target instanceof HTMLInputElement && !radio) || target.closest("[aria-haspopup]")) return;
    const step =
      event.key === "j" || (event.key === "ArrowDown" && !radio)
        ? 1
        : event.key === "k" || (event.key === "ArrowUp" && !radio)
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = visible.findIndex((v) => v.line.key === active?.line.key);
    const to = visible[Math.min(visible.length - 1, Math.max(0, index + step))];
    if (to) rows.current.get(to.line.key)?.focus();
  }

  function addLine(requestedText: string, candidate: Candidate | null) {
    const key = `m${state.addedCount}`;
    dispatch({ type: "addLine", requestedText, candidate });
    setPinned((keys) => new Set(keys).add(key));
    setAdding(false);
    setFocusRequest({ key, target: "quantity", nonce: Date.now() });
  }

  function openAddLine() {
    setAdding(true);
    // The panel renders on the next commit; wait for it before focusing the search box.
    requestAnimationFrame(() => {
      const input = document.getElementById("add-line-search");
      input?.scrollIntoView?.({ block: "nearest" });
      input?.focus({ preventScroll: true });
    });
  }

  const goneOffers = save.status === "offerMissing" ? save.gone : null;

  return (
    <>
      <Toolbar title={title} subtitle={<DocumentStatus save={save} summary={summary} />}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={emailVisible ? "Hide original email" : "Show original email"}
          aria-pressed={emailVisible}
          title={emailVisible ? "Hide original email" : "Show original email"}
          onClick={() => setEmailOpen(!emailVisible)}
          className={cn(emailVisible && "bg-accent text-primary")}
        >
          <PanelRight aria-hidden />
        </Button>
        <MarkupInput
          text={state.markupText}
          invalid={summary.blockers.markupInvalid}
          onChange={(text) => dispatch({ type: "setMarkup", text })}
        />
        <div className="w-24 text-right leading-tight">
          <p className="text-caption text-muted-foreground">Total</p>
          <p className="text-body font-semibold tabular-nums">{formatCents(summary.totalCents)}</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!summary.canSave || locked}
          aria-describedby="save-status"
          aria-keyshortcuts="Meta+S Control+S"
          title={summary.canSave ? undefined : `To save: ${describeBlockers(summary.blockers).join(", ")}`}
          className="gap-2"
        >
          {save.status === "saving" && <LoaderCircle aria-hidden className="animate-spin" />}
          {saveLabel[save.status]}
          {!locked && <Shortcut keys="S" />}
        </Button>
      </Toolbar>

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* One row at every width: the status text wraps inside its own space instead. */}
          <div className="flex min-h-11 shrink-0 items-center gap-4 border-b border-border px-5 py-1.5">
            {views.length > 0 && (
              <SegmentedControl
                label="Show lines"
                value={filter}
                onChange={chooseFilter}
                segments={(["all", "attention", "ready", "unmatched"] as const).map((value) => ({
                  value,
                  label: filterLabels[value],
                  count: value === "all" ? views.length : views.filter((v) => v.status === value).length,
                }))}
              />
            )}
            <div
              id="save-status"
              aria-live="polite"
              className="flex min-w-0 flex-1 items-center justify-end gap-3 text-right text-footnote text-balance"
            >
              <SaveStatus save={save} summary={summary} />
              {next && !locked && (
                <Button variant="outline" size="sm" onClick={() => goTo(next)} className="gap-0.5 pr-1.5">
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              )}
            </div>
          </div>

          <main className="@container/lines relative min-h-0 flex-1 overflow-y-auto">
            {seed.notices.length > 0 && (
              <div className="px-5 pt-4 pb-1">
                <Notices notices={seed.notices} onAddLine={adding ? null : openAddLine} />
              </div>
            )}

            <div
              aria-hidden
              className={cn(
                LINE_GRID,
                "sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-1.5 text-caption font-semibold text-muted-foreground backdrop-blur",
                views.length === 0 && "hidden",
              )}
            >
              <span>Item</span>
              <span className="text-right whitespace-nowrap" title="Quantity in each">
                Qty (ea)
              </span>
              <span>Supplier</span>
              <span className="text-right">Unit Price</span>
              <span className="text-right">Extended</span>
              <span />
            </div>

            {visible.length > 0 ? (
              <ol aria-label="Lines" onKeyDown={onLinesKeyDown} className="divide-y divide-border border-b border-border">
                {visible.map((view) => (
                  <LineRow
                    key={view.line.key}
                    view={view}
                    markupBps={state.markupBps}
                    dispatch={dispatch}
                    active={view === active}
                    offerGone={selectionOf(view) !== "" && goneOffers?.get(view.line.key) === selectionOf(view)}
                    onActivate={() => setActiveKey(view.line.key)}
                    onHover={(hovering) => setHoverKey(hovering ? view.line.key : null)}
                    rowRef={(element) => {
                      if (element) rows.current.set(view.line.key, element);
                      else rows.current.delete(view.line.key);
                    }}
                  />
                ))}
              </ol>
            ) : (
              <EmptyLines filter={views.length === 0 ? null : filter} onShowAll={() => chooseFilter("all")} />
            )}

            {adding && (
              <div className="border-b border-border px-5 py-3">
                <AddLinePanel markupBps={state.markupBps} onAdd={addLine} onCancel={() => setAdding(false)} />
              </div>
            )}
            {(!adding || views.length > 0) && (
              // Same columns as the lines, so the total sits under Extended.
              <div className={cn(LINE_GRID, "min-h-12 items-center px-5 py-2.5")}>
                <div>
                  {!adding && (
                    <Button variant="outline" onClick={openAddLine}>
                      <Plus aria-hidden />
                      Add Line
                    </Button>
                  )}
                </div>
                {views.length > 0 && (
                  <>
                    <p className="col-span-3 text-right text-footnote text-muted-foreground">
                      {summary.unpricedCount > 0
                        ? `Total, excluding ${plural(summary.unpricedCount, "unpriced line", "unpriced lines")}`
                        : "Total"}
                    </p>
                    <p className="text-right font-semibold tabular-nums">{formatCents(summary.totalCents)}</p>
                  </>
                )}
              </div>
            )}
          </main>
        </div>

        <EmailPane
          emailText={emailText}
          sourceText={highlighted?.line.seed?.extracted.sourceText ?? null}
          revealKey={active?.line.key ?? null}
          onClose={() => setEmailOpen(false)}
          // Beside the lines when the window is wide; floats over them when it isn't.
          className={cn(
            emailOpen === null ? "hidden xl:flex" : emailOpen ? "flex" : "hidden",
            "max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-xl:z-30 max-xl:shadow-float",
          )}
        />
      </div>
    </>
  );
}

/** Whether a media query matches. The server assumes a wide window. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

/** The document's state under its title, as a Mac app shows "Edited", plus REV-10's warning. */
function DocumentStatus({ save, summary }: { save: SaveState; summary: ReviewSummary }) {
  const saved = save.status === "saved" ? "Saved" : save.status === "alreadySaved" ? "Already saved" : "Not saved";
  return (
    <>
      {saved} · {plural(summary.lineCount, "line", "lines")}
      {summary.shortCount > 0 && (
        <span className="text-warning-foreground">
          {" · "}
          <TriangleAlert aria-hidden className="mb-px inline size-3 text-warning" />{" "}
          {plural(summary.shortCount, "line quotes", "lines quote")} more than on hand
        </span>
      )}
    </>
  );
}

function MarkupInput({ text, invalid, onChange }: { text: string; invalid: boolean; onChange: (text: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-footnote text-muted-foreground">
      Markup
      <span className="relative">
        <input
          value={text}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={invalid ? "save-status" : undefined}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-7 w-[4.25rem] rounded-md border bg-background pr-6 pl-2 text-right text-body text-foreground tabular-nums shadow-xs outline-none focus-visible:ring-3",
            invalid ? "border-destructive focus-visible:ring-destructive/30" : "border-input focus-visible:ring-ring/45",
          )}
        />
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-body text-muted-foreground">
          %
        </span>
      </span>
    </label>
  );
}

/** What is left before Save (REV-6), or how the last save went. */
function SaveStatus({ save, summary }: { save: SaveState; summary: ReviewSummary }) {
  const linkClass =
    "rounded font-medium text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/45";
  let message: ReactNode;
  switch (save.status) {
    case "saving":
    case "saved":
      return null;
    case "alreadySaved":
      return (
        <p className="text-muted-foreground">
          This email was already saved as a draft.{" "}
          <Link href={`/quotes/${save.quoteId}`} className={linkClass}>
            View Draft
          </Link>
        </p>
      );
    case "extractionMissing":
      return (
        <p role="alert" className="text-destructive">
          Couldn&apos;t save: this extraction no longer exists.{" "}
          <Link href="/" className={linkClass}>
            Start a New Quote
          </Link>
        </p>
      );
    case "rejected":
      message = "Couldn't save: the server rejected this draft. Your edits are still here.";
      break;
    case "offerMissing":
      message = `Couldn't save: ${plural(save.gone.size, "line's offer is", "lines' offers are")} no longer in inventory.`;
      break;
    case "failed":
      message = `Couldn't save, your edits are still here${save.httpStatus ? ` (server answered ${save.httpStatus})` : ""}.`;
      break;
    case "idle": {
      const left = describeBlockers(summary.blockers);
      if (left.length === 0) {
        return (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <CircleCheck aria-hidden className="size-3.5 text-success" />
            Ready to save
          </p>
        );
      }
      return <p className="text-muted-foreground">To save: {left.join(", ")}.</p>;
    }
  }
  return (
    <p role="alert" className="text-destructive">
      {message}
    </p>
  );
}

function EmptyLines({ filter, onShowAll }: { filter: LineFilter | null; onShowAll: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
      <p className="font-semibold">{filter === null ? "No lines yet" : `No ${filterLabels[filter].toLowerCase()} lines`}</p>
      <p className="text-footnote text-muted-foreground">
        {filter === null ? "Add the requested items from the email by hand." : "Every line is under another filter."}
      </p>
      {filter !== null && (
        <Button variant="outline" size="sm" onClick={onShowAll}>
          Show All Lines
        </Button>
      )}
    </div>
  );
}

function AddLinePanel({
  markupBps,
  onAdd,
  onCancel,
}: {
  markupBps: number;
  onAdd: (requestedText: string, candidate: Candidate | null) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Add Line</h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <PartSearch
        inputId="add-line-search"
        label="Search inventory for a new line"
        placeholder="Search inventory, or describe the item to add it unmatched"
        markupBps={markupBps}
        onPick={(candidate, query) => onAdd(query, candidate)}
        actions={(query) => (
          <Button variant="outline" disabled={!query} onClick={() => onAdd(query, null)}>
            Add Unmatched
          </Button>
        )}
      />
    </div>
  );
}
