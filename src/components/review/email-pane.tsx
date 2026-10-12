"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { findSourceRange } from "./source-range";

type Props = {
  emailText: string;
  /** The source text to highlight: the hovered line's, else the active line's (REV-8). */
  sourceText: string | null;
  /** Changes when the active line changes, to bring its source into view. */
  revealKey: string | null;
  onClose: () => void;
  className?: string;
};

/**
 * The original email beside the lines (REV-1), with the source of the line the rep is on
 * highlighted (REV-8). It is rendered as a text node, so the email is always escaped
 * plain text, never HTML (EXT-5).
 */
export function EmailPane({ emailText, sourceText, revealKey, onClose, className }: Props) {
  const range = sourceText ? findSourceRange(emailText, sourceText) : null;
  const mark = useRef<HTMLElement>(null);

  // Follow the active line, not the hovered one, so moving the mouse never scrolls the email.
  useEffect(() => {
    mark.current?.scrollIntoView?.({ block: "nearest" });
  }, [revealKey]);

  return (
    <aside aria-label="Original email" className={cn("w-[19rem] shrink-0 flex-col border-l border-border bg-card 2xl:w-[24rem]", className)}>
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border pr-2 pl-4">
        <h2 className="text-footnote font-semibold text-muted-foreground">Original Email</h2>
        <button
          type="button"
          aria-label="Hide original email"
          title="Hide original email"
          onClick={onClose}
          className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/45"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-footnote leading-5 break-words whitespace-pre-wrap">
        {range ? (
          <>
            {emailText.slice(0, range[0])}
            <mark ref={mark} className="scroll-my-6 rounded-[3px] bg-mark text-inherit ring-2 ring-mark">
              {emailText.slice(range[0], range[1])}
            </mark>
            {emailText.slice(range[1])}
          </>
        ) : (
          emailText
        )}
      </pre>
    </aside>
  );
}
