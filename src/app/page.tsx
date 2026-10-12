import type { Metadata } from "next";
import { PasteForm } from "@/components/paste/paste-form";
import { Toolbar } from "@/components/shell/toolbar";

// The layout's title template only applies to child segments, not to this page beside it.
export const metadata: Metadata = { title: { absolute: "New Quote · Email to Draft" } };

export default function NewQuotePage() {
  return (
    <>
      <Toolbar title="New Quote" />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-8">
          <PasteForm />
        </div>
      </main>
    </>
  );
}
