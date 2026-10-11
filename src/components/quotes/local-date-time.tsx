"use client";

import { useSyncExternalStore } from "react";

const format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const subscribe = () => () => {};

/**
 * A timestamp in the rep's own timezone and locale. The server can't know either, so its
 * render leaves the text empty and the browser fills it in during hydration. Client-side
 * navigations render it directly.
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => format.format(new Date(iso)),
    () => null,
  );
  return <time dateTime={iso}>{text}</time>;
}
