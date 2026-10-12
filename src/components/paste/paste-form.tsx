"use client";

import { ArrowRight, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasShortcutModifier, Shortcut } from "@/components/shell/shortcut";
import { Button, buttonVariants } from "@/components/ui/button";
import { MAX_EMAIL_CHARS } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { postExtraction } from "./extract-request";
import { clientTimeoutFailure, describeFailure, type Failure } from "./failure";

/** EXT-3: the wait never exceeds 30 seconds. The server answers within 28 (technical design 6). */
export const CLIENT_TIME_LIMIT_MS = 30_000;

type PasteState =
  | { status: "idle"; cancelled: boolean }
  | { status: "extracting" }
  | { status: "opening" }
  | { status: "failed"; failure: Failure };

const count = new Intl.NumberFormat("en-US");

/**
 * The paste page form (EXT-1, EXT-3). Each Extract is one request with its own extraction ID,
 * and nothing is kept outside this component, so other tabs never see it (EXT-4).
 */
export function PasteForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, setState] = useState<PasteState>({ status: "idle", cancelled: false });
  const inFlight = useRef<{ controller: AbortController; reason: "cancel" | "timeout" | null } | null>(null);
  const resetWhenHidden = useRef(false);

  // Next.js keeps this page mounted but hidden after navigating away (Activity). Stop any
  // request then, and after a successful extraction clear the form for the next email.
  useLayoutEffect(() => {
    return () => {
      const request = inFlight.current;
      inFlight.current = null;
      request?.controller.abort();
      if (resetWhenHidden.current) setText("");
      resetWhenHidden.current = false;
      setState({ status: "idle", cancelled: false });
    };
  }, []);

  // The text box grows with the email (the page scrolls), instead of a fixed tall box.
  const textarea = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);

  const length = text.trim().length;
  const tooLong = length > MAX_EMAIL_CHARS;
  const busy = state.status === "extracting" || state.status === "opening";

  async function extract() {
    if (busy || length === 0 || tooLong) return;
    const request = { controller: new AbortController(), reason: null as "cancel" | "timeout" | null };
    inFlight.current = request;
    setState({ status: "extracting" });
    const timer = setTimeout(() => {
      request.reason = "timeout";
      request.controller.abort();
    }, CLIENT_TIME_LIMIT_MS);

    try {
      const outcome = await postExtraction(text, request.controller.signal);
      if (inFlight.current !== request) return;
      if (outcome.kind === "ok") {
        resetWhenHidden.current = true;
        setState({ status: "opening" });
        router.push(`/review/${outcome.extractionId}`);
      } else {
        setState({ status: "failed", failure: describeFailure(outcome) });
      }
    } catch {
      // Only an abort lands here: our own Cancel or time limit, or the page being hidden.
      if (inFlight.current !== request) return;
      setState(
        request.reason === "timeout"
          ? { status: "failed", failure: clientTimeoutFailure }
          : { status: "idle", cancelled: true },
      );
    } finally {
      clearTimeout(timer);
      if (inFlight.current === request) inFlight.current = null;
    }
  }

  function cancel() {
    if (!inFlight.current) return;
    inFlight.current.reason = "cancel";
    inFlight.current.controller.abort();
  }

  return (
    <form
      aria-label="New quote"
      className="rounded-xl bg-card shadow-card"
      onSubmit={(event) => {
        event.preventDefault();
        void extract();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && hasShortcutModifier(event)) {
          event.preventDefault();
          void extract();
        }
      }}
    >
      {/* Stays in view while a long email scrolls, so Extract is always where the eye is. */}
      <div className="sticky top-0 z-10 flex min-h-16 items-center gap-4 rounded-t-xl border-b border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h2 className="text-body font-semibold">Customer Email</h2>
          <p className="truncate text-footnote text-muted-foreground">
            Each line is matched to inventory and priced. You review it before saving.
          </p>
        </div>
        {busy ? (
          <div className="flex shrink-0 items-center gap-3">
            <Waiting opening={state.status === "opening"} />
            {state.status === "extracting" && (
              <Button type="button" variant="outline" onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>
        ) : (
          <Button
            type="submit"
            disabled={length === 0 || tooLong}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            className="shrink-0 gap-2 px-3"
          >
            Extract
            <Shortcut keys="↩" />
          </Button>
        )}
      </div>

      {state.status === "idle" && state.cancelled && (
        <p role="status" className="border-b border-border bg-muted px-5 py-2.5 text-footnote text-muted-foreground">
          Extraction cancelled. Your email is still here.
        </p>
      )}
      {state.status === "failed" && <FailurePanel failure={state.failure} onRetry={() => void extract()} />}

      <textarea
        ref={textarea}
        aria-label="Customer email"
        aria-describedby="email-length"
        autoFocus
        value={text}
        readOnly={busy}
        spellCheck={false}
        rows={1}
        placeholder="Paste the email here, including any tables and forwarded messages."
        onChange={(event) => {
          setText(event.target.value);
          if (state.status !== "extracting") setState({ status: "idle", cancelled: false });
        }}
        className="block min-h-64 w-full resize-none bg-transparent px-5 py-4 font-mono text-body text-foreground outline-none placeholder:font-sans placeholder:text-faint-foreground read-only:text-muted-foreground"
      />

      <div className="flex min-h-10 items-center gap-3 rounded-b-xl border-t border-border px-5 py-2 text-footnote">
        <p id="email-length" className={cn("tabular-nums", tooLong ? "text-destructive" : "text-muted-foreground")}>
          {count.format(length)} / {count.format(MAX_EMAIL_CHARS)} characters
        </p>
        {tooLong && (
          <p role="alert" className="text-destructive">
            {count.format(length - MAX_EMAIL_CHARS)} characters over the limit. Remove older messages or signatures.
          </p>
        )}
      </div>
    </form>
  );
}

/** Spinner and elapsed seconds while waiting (EXT-3). Ticks on its own, so typing never lags. */
function Waiting({ opening }: { opening: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = performance.now();
    const id = setInterval(() => setSeconds(Math.floor((performance.now() - startedAt) / 1000)), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="flex items-center gap-2 text-body text-muted-foreground">
      <LoaderCircle aria-hidden className="size-4 animate-spin text-faint-foreground" />
      <span role="status">{opening ? "Opening review" : "Extracting"}</span>
      <span className="w-8 tabular-nums">{seconds} s</span>
    </p>
  );
}

function FailurePanel({ failure, onRetry }: { failure: Failure; onRetry: () => void }) {
  const wait = useCountdown(failure.retryAfterSeconds);
  return (
    <div role="alert" className="flex items-start gap-3 border-b border-border bg-muted px-5 py-3">
      <TriangleAlert aria-hidden className="mt-px size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold">
          {failure.retryAfterSeconds === null
            ? failure.title
            : wait > 0
              ? `Rate limited, try again in ${wait} seconds.`
              : "Rate limited. You can retry now."}
        </p>
        {failure.detail && <p className="text-footnote text-muted-foreground">{failure.detail}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {failure.retryable && (
            <Button type="button" variant="outline" disabled={wait > 0} onClick={onRetry}>
              {wait > 0 ? `Retry in ${wait} s` : "Retry"}
            </Button>
          )}
          {failure.extractionId && (
            <Link href={`/review/${failure.extractionId}`} className={cn(buttonVariants({ variant: "outline" }))}>
              Continue Manually
              <ArrowRight aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Whole seconds left of a wait that starts when the component mounts. */
function useCountdown(seconds: number | null): number {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    if (!seconds) return;
    const endsAt = performance.now() + seconds * 1000;
    const id = setInterval(() => {
      const next = Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
      setLeft(next);
      if (next === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [seconds]);
  return left;
}
