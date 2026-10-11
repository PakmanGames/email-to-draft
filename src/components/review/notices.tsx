import { Info, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Notice } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const kinds: Record<Notice["code"], { title: string; warning: boolean; offerAdd: boolean }> = {
  NO_ITEMS: { title: "No items requested", warning: false, offerAdd: true },
  SUPERSEDED: { title: "Earlier message replaced", warning: false, offerAdd: false },
  LINES_DISCARDED: { title: "Some lines were discarded", warning: true, offerAdd: false },
  EXTRACTION_FAILED: { title: "Extraction didn't complete", warning: true, offerAdd: true },
};

/**
 * Extraction notices above the lines (technical design section 8), each with a way forward.
 * `onAddLine` is null while the add-line panel is already open.
 */
export function Notices({ notices, onAddLine }: { notices: Notice[]; onAddLine: (() => void) | null }) {
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2">
      {notices.map((notice, i) => {
        const { title, warning, offerAdd } = kinds[notice.code];
        const Icon = warning ? TriangleAlert : Info;
        return (
          <div
            key={`${notice.code}-${i}`}
            role="status"
            className={cn(
              "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px] ring-1 ring-inset",
              warning ? "bg-amber-50 text-amber-950 ring-amber-600/20" : "bg-white text-neutral-800 ring-neutral-200",
            )}
          >
            <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", warning ? "text-amber-600" : "text-neutral-500")} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{title}</p>
              <p className={warning ? "text-amber-900" : "text-neutral-600"}>{notice.message}</p>
            </div>
            {offerAdd && onAddLine && (
              <Button variant="outline" size="sm" onClick={onAddLine}>
                <Plus aria-hidden />
                Add line
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
