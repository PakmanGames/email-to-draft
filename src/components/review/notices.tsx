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
              "flex items-center gap-3 rounded-lg border px-3.5 py-2.5",
              warning ? "border-warning-border bg-warning-surface" : "border-border bg-muted",
            )}
          >
            <Icon aria-hidden className={cn("size-4 shrink-0", warning ? "text-warning" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <p className={cn("font-semibold", warning && "text-warning-foreground")}>{title}</p>
              <p className={cn("text-footnote", warning ? "text-warning-foreground" : "text-muted-foreground")}>
                {notice.message}
              </p>
            </div>
            {offerAdd && onAddLine && (
              <Button variant="outline" size="sm" onClick={onAddLine}>
                <Plus aria-hidden />
                Add Line
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
