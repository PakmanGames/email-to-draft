import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// Replaces the whole page, so it brings its own layout and heading.
export default function QuoteNotFound() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-2 p-8">
      <Link
        href="/quotes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Draft quotes
      </Link>
      <h1 className="text-2xl font-semibold">Draft not found</h1>
      <p className="text-sm text-muted-foreground">This link doesn&apos;t match a saved draft.</p>
    </main>
  );
}
