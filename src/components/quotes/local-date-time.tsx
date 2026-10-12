"use client";

import { useSyncExternalStore } from "react";

const full = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const subscribe = () => () => {};

/** Like Mail's message list: the time for today, the month and day this year, else the date. */
function formatShort(value: Date): string {
  const now = new Date();
  if (value.toDateString() === now.toDateString()) return time.format(value);
  if (value.getFullYear() === now.getFullYear()) return monthDay.format(value);
  return date.format(value);
}

/**
 * A timestamp in the rep's own timezone and locale. The server can't know either, so its
 * render leaves the text empty and the browser fills it in during hydration. Client-side
 * navigations render it directly.
 */
export function LocalDateTime({ iso, short = false }: { iso: string; short?: boolean }) {
  const text = useSyncExternalStore(
    subscribe,
    () => (short ? formatShort(new Date(iso)) : full.format(new Date(iso))),
    () => null,
  );
  return <time dateTime={iso}>{text}</time>;
}
