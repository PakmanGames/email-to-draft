import Link from "next/link";
import { PasteForm } from "@/components/paste/paste-form";

export default function PastePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="flex h-12 shrink-0 items-center border-b border-neutral-200 bg-white px-4">
        <p className="text-sm font-semibold">RFQ to Draft Quote</p>
        <Link
          href="/quotes"
          className="ml-auto rounded-md text-[13px] text-neutral-600 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-400/60 focus-visible:outline-none"
        >
          Drafts
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold">Paste an RFQ email</h1>
        <p className="mt-1 mb-4 text-sm text-neutral-600">
          One email at a time, as it arrived. The line items are matched to inventory and priced for you to review.
        </p>
        <PasteForm />
      </main>
    </div>
  );
}
