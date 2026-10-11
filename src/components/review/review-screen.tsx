"use client";

import {
  ArrowLeft,
  CircleCheck,
  CircleHelp,
  CircleMinus,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Candidate, ReviewSeed } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { formatCents, formatCount, plural } from "./format";
import { LINE_GRID, LineRow } from "./line-row";
import { Notices } from "./notices";
import { PartSearch } from "./part-search";
import {
  buildSaveRequest,
  describeBlockers,
  initReviewState,
  reviewReducer,
  summarize,
  viewLine,
  type ReviewSummary,
} from "./review-model";
import { postQuote } from "./save-draft";

type Props = { extractionId: string; emailText: string; seed: ReviewSeed };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "alreadySaved"; quoteId: string }
  | { status: "offerMissing"; lineNumbers: number[] }
  | { status: "failed"; httpStatus: number | null };

const saveLabel: Record<SaveState["status"], string> = {
  idle: "Save draft",
  saving: "Saving",
  saved: "Saved",
  alreadySaved: "Save draft",
  offerMissing: "Save draft",
  // PRD section 6: "Couldn't save, your edits are still here" with Retry.
  failed: "Retry save",
};

/**
 * The review screen (technical design section 8, REV-1 to REV-10). All review state lives in
 * this component's reducer, so it is per tab and gone on reload: nothing is shared with other
 * tabs (EXT-4). Render it with `key={extractionId}` so a different extraction starts fresh.
 */
export function ReviewScreen({ extractionId, emailText, seed }: Props) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reviewReducer, seed, initReviewState);
  const views = useMemo(
    () => state.lines.map((line, i) => viewLine(line, i, state.markupBps)),
    [state.lines, state.markupBps],
  );
  const summary = summarize(state, views);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  // null follows the viewport: open at 1280px and up, collapsed below (REV-1 at 1024px).
  // With no lines, the rep types them from the email, so it starts open at any width.
  const [emailOpen, setEmailOpen] = useState<boolean | null>(seed.lines.length === 0 ? true : null);
  const [adding, setAdding] = useState(seed.lines.length === 0);
  const focusAfterAdd = useRef<string | null>(null);

  useEffect(() => {
    if (!focusAfterAdd.current) return;
    document.getElementById(`line-${focusAfterAdd.current}-qty`)?.focus();
    focusAfterAdd.current = null;
  }, [state.lines]);

  const locked = save.status === "saving" || save.status === "saved" || save.status === "alreadySaved";

  async function handleSave() {
    if (!summary.canSave || locked) return;
    setSave({ status: "saving" });
    const outcome = await postQuote(buildSaveRequest(extractionId, state, views));
    switch (outcome.kind) {
      case "created":
        setSave({ status: "saved" });
        router.push(`/quotes/${outcome.quoteId}`);
        break;
      case "alreadySaved":
        setSave({ status: "alreadySaved", quoteId: outcome.quoteId });
        break;
      case "offerMissing":
        setSave({ status: "offerMissing", lineNumbers: outcome.linePositions.map((p) => p + 1) });
        break;
      case "failed":
        setSave({ status: "failed", httpStatus: outcome.httpStatus });
        break;
    }
  }

  function addLine(requestedText: string, candidate: Candidate | null) {
    focusAfterAdd.current = `m${state.addedCount}`;
    dispatch({ type: "addLine", requestedText, candidate });
    setAdding(false);
  }

  function openAddLine() {
    setAdding(true);
    // The panel renders on the next commit; wait for it before focusing the search box.
    requestAnimationFrame(() => {
      const input = document.getElementById("add-line-search");
      input?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      input?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="shrink-0 border-b border-neutral-200 bg-white">
        <div className="flex min-h-12 items-center gap-3 px-4 py-1.5">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md text-[13px] text-neutral-600 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none"
          >
            <ArrowLeft aria-hidden className="size-4" />
            New email
          </Link>
          <span aria-hidden className="h-4 w-px bg-neutral-200" />
          <h1 className="text-sm font-semibold">Review quote</h1>

          <div className="ml-auto flex items-center gap-4 pl-4">
            <MarkupInput
              text={state.markupText}
              invalid={summary.blockers.markupInvalid}
              onChange={(text) => dispatch({ type: "setMarkup", text })}
            />
            <div className="text-right leading-tight">
              <p className="text-[11px] text-neutral-500">Total</p>
              <p className="text-sm font-semibold tabular-nums">{formatCents(summary.totalCents)}</p>
            </div>
            <div
              id="save-status"
              aria-live="polite"
              className="flex max-w-[26rem] flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-right text-xs leading-4"
            >
              <SaveStatus
                save={save}
                summary={summary}
                onGoTo={(target) => goToLine(target.key, target.target)}
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={!summary.canSave || locked}
              aria-describedby="save-status"
              className="h-8 px-3"
            >
              {save.status === "saving" && <LoaderCircle aria-hidden className="animate-spin" />}
              {saveLabel[save.status]}
            </Button>
          </div>
        </div>

        <div className="flex min-h-10 items-center border-t border-neutral-100 px-4 py-2 text-[13px]">
          <SummaryBar summary={summary} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Original email"
          className={cn(
            "w-[22rem] shrink-0 flex-col border-r border-neutral-200 bg-white 2xl:w-[28rem]",
            emailOpen === null ? "hidden xl:flex" : emailOpen ? "flex" : "hidden",
          )}
        >
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-neutral-100 pr-2 pl-4">
            <h2 className="text-xs font-medium text-neutral-600">Original email</h2>
            <button
              type="button"
              aria-label="Hide original email"
              title="Hide original email"
              onClick={() => setEmailOpen(false)}
              className="grid size-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none"
            >
              <PanelLeftClose aria-hidden className="size-4" />
            </button>
          </div>
          {/* Rendered as a text node, so the email is always escaped plain text (EXT-5). */}
          <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-neutral-800">
            {emailText}
          </pre>
        </aside>
        <div
          className={cn(
            "w-11 shrink-0 flex-col items-center border-r border-neutral-200 bg-white pt-1.5",
            emailOpen === null ? "flex xl:hidden" : emailOpen ? "hidden" : "flex",
          )}
        >
          <button
            type="button"
            aria-label="Show original email"
            title="Show original email"
            onClick={() => setEmailOpen(true)}
            className="grid size-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none"
          >
            <PanelLeftOpen aria-hidden className="size-4" />
          </button>
          <span aria-hidden className="mt-2 text-xs text-neutral-500 [writing-mode:vertical-rl]">
            Original email
          </span>
        </div>

        {/* relative: sr-only text inside must not extend the document past this scroll area. */}
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="max-w-6xl space-y-3 p-4">
            <Notices notices={seed.notices} onAddLine={adding ? null : openAddLine} />

            <section aria-label="Lines" className="rounded-lg border border-neutral-200 bg-white shadow-xs">
              <div
                aria-hidden
                className={cn(
                  LINE_GRID,
                  "sticky top-0 z-10 rounded-t-lg border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-500",
                )}
              >
                <span>#</span>
                <span>Requested and matched</span>
                <span className="text-right">Qty (each)</span>
                <span className="text-right">On hand</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Extended</span>
                <span />
              </div>

              {views.length > 0 ? (
                <ol className="divide-y divide-neutral-100">
                  {views.map((view) => (
                    <LineRow key={view.line.key} view={view} markupBps={state.markupBps} dispatch={dispatch} />
                  ))}
                </ol>
              ) : (
                <p className="px-3 py-6 text-center text-[13px] text-neutral-500">No lines yet. Add them from the email by hand.</p>
              )}

              {adding && (
                <div className="border-t border-neutral-200 px-3 py-2.5">
                  <AddLinePanel markupBps={state.markupBps} onAdd={addLine} onCancel={() => setAdding(false)} />
                </div>
              )}
              {/* Same columns as the lines, so the total sits under Extended. */}
              {(!adding || views.length > 0) && (
                <div className={cn(LINE_GRID, "min-h-12 items-center rounded-b-lg border-t border-neutral-200 px-3 py-2")}>
                  <div className="col-span-2">
                    {!adding && (
                      <Button variant="outline" size="sm" onClick={openAddLine}>
                        <Plus aria-hidden />
                        Add line
                      </Button>
                    )}
                  </div>
                  {views.length > 0 && (
                    <>
                      <p className="col-span-3 text-right text-xs text-neutral-500">
                        {summary.unpricedCount > 0
                          ? `Total, excluding ${plural(summary.unpricedCount, "unpriced line", "unpriced lines")}`
                          : "Total"}
                      </p>
                      <p className="text-right text-[13px] font-semibold tabular-nums">{formatCents(summary.totalCents)}</p>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/** Scrolls a line into view and focuses the control that answers what it is waiting on. */
function goToLine(key: string, target: "choice" | "quantity") {
  const element = document.getElementById(target === "choice" ? `line-${key}-choice` : `line-${key}-qty`);
  element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  const input = element instanceof HTMLInputElement ? element : element?.querySelector("input");
  input?.focus({ preventScroll: true });
}

function MarkupInput({ text, invalid, onChange }: { text: string; invalid: boolean; onChange: (text: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-600">
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
            "h-8 w-[4.5rem] rounded-md border bg-white pr-6 pl-2 text-right text-[13px] text-neutral-900 tabular-nums shadow-xs outline-none focus-visible:ring-2",
            invalid
              ? "border-red-400 focus-visible:ring-red-400/30"
              : "border-neutral-200 focus-visible:border-neutral-400 focus-visible:ring-neutral-400/30",
          )}
        />
        <span aria-hidden className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[13px] text-neutral-400">
          %
        </span>
      </span>
    </label>
  );
}

/** REV-2 and REV-10: what the lines add up to, each count with an icon and words. */
function SummaryBar({ summary }: { summary: ReviewSummary }) {
  const { groups } = summary;
  const items: { show: boolean; icon: ReactNode; text: string }[] = [
    { show: groups.ready > 0, icon: <CircleCheck className="text-emerald-600" />, text: `${formatCount(groups.ready)} ready` },
    {
      show: groups.needChoice > 0,
      icon: <CircleHelp className="text-sky-600" />,
      text: `${formatCount(groups.needChoice)} need${groups.needChoice === 1 ? "s" : ""} a choice`,
    },
    {
      show: groups.needQuantity > 0,
      icon: <TriangleAlert className="text-amber-600" />,
      text: `${formatCount(groups.needQuantity)} need${groups.needQuantity === 1 ? "s" : ""} a quantity`,
    },
    {
      show: groups.toConfirm > 0,
      icon: <TriangleAlert className="text-amber-600" />,
      text: plural(groups.toConfirm, "quantity to confirm", "quantities to confirm"),
    },
    { show: groups.unmatched > 0, icon: <CircleMinus className="text-neutral-400" />, text: `${formatCount(groups.unmatched)} unmatched` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-neutral-700">
      <span className="font-medium text-neutral-900">
        {summary.lineCount === 0 ? "No lines yet" : plural(summary.lineCount, "line", "lines")}
      </span>
      {summary.lineCount > 0 &&
        items
          .filter((item) => item.show)
          .map((item) => (
            <span key={item.text} className="inline-flex items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0">
              <span aria-hidden className="contents">{item.icon}</span>
              {item.text}
            </span>
          ))}
      {summary.shortCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-0.5 text-amber-900 ring-1 ring-amber-600/20 ring-inset">
          <TriangleAlert aria-hidden className="size-3.5 text-amber-600" />
          {plural(summary.shortCount, "line quotes", "lines quote")} more than on hand
        </span>
      )}
    </div>
  );
}

function SaveStatus({
  save,
  summary,
  onGoTo,
}: {
  save: SaveState;
  summary: ReviewSummary;
  onGoTo: (target: NonNullable<ReviewSummary["firstBlocked"]>) => void;
}) {
  const linkClass =
    "rounded font-medium text-neutral-900 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none";

  if (save.status === "alreadySaved") {
    return (
      <span className="text-neutral-700">
        This email was already saved as a draft.{" "}
        <Link href={`/quotes/${save.quoteId}`} className={linkClass}>
          View draft
        </Link>
      </span>
    );
  }
  if (save.status === "saved" || save.status === "saving") return null;
  if (save.status === "failed" || save.status === "offerMissing") {
    const message =
      save.status === "failed"
        ? `Couldn't save, your edits are still here${save.httpStatus ? ` (server answered ${save.httpStatus})` : ""}.`
        : `Couldn't save: the offer for ${save.lineNumbers.length === 1 ? "line" : "lines"} ${save.lineNumbers.join(", ")} is no longer in inventory. Pick another supplier or part.`;
    return (
      <span role="alert" className="text-red-700">
        {message}
      </span>
    );
  }

  const left = describeBlockers(summary.blockers);
  const { firstBlocked } = summary;
  if (left.length === 0) return null;
  return (
    <>
      <span className="text-neutral-600">To save: {left.join(", ")}.</span>
      {firstBlocked && (
        <button type="button" onClick={() => onGoTo(firstBlocked)} className={linkClass}>
          Go to line {firstBlocked.number}
        </button>
      )}
    </>
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
        <h3 className="text-xs font-medium text-neutral-700">Add a line</h3>
        <Button variant="ghost" size="xs" onClick={onCancel}>
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
          <Button variant="outline" size="sm" disabled={!query} onClick={() => onAdd(query, null)}>
            Add unmatched
          </Button>
        )}
      />
    </div>
  );
}
