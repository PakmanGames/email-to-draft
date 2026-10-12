"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * True when the shortcut modifier is held: ⌘ on a Mac, Ctrl elsewhere. Both are accepted
 * everywhere, so a rep with a PC keyboard on a Mac isn't stuck.
 */
export function hasShortcutModifier(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.metaKey || event.ctrlKey;
}

/**
 * A keyboard shortcut hint such as ⌘S, shown inside a button. The server renders the Mac
 * form, and the browser switches to "Ctrl" on other platforms after hydration.
 */
export function Shortcut({ keys, className }: { keys: string; className?: string }) {
  const modifier = useSyncExternalStore(
    subscribe,
    () => (isApple() ? "⌘" : "Ctrl "),
    () => "⌘",
  );
  return (
    <kbd aria-hidden className={cn("font-sans text-footnote font-normal opacity-70", className)}>
      {modifier}
      {keys}
    </kbd>
  );
}
