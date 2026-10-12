import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** The way back to the list, where a Mac app puts it: the leading edge of the toolbar. */
export function BackToDrafts() {
  return (
    <Link
      href="/quotes"
      className="-ml-1.5 inline-flex h-7 items-center gap-0.5 rounded-md pr-2 pl-1 text-body text-primary outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/45"
    >
      <ChevronLeft aria-hidden className="size-4" />
      Drafts
    </Link>
  );
}
