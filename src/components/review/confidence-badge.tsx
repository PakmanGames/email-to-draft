import { CircleCheck, CircleHelp, CircleMinus, Pencil, type LucideIcon } from "lucide-react";
import type { Confidence } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const styles: Record<Confidence | "manual", { label: string; icon: LucideIcon; className: string }> = {
  high: { label: "High", icon: CircleCheck, className: "bg-emerald-50 text-emerald-800 ring-emerald-600/25" },
  low: { label: "Low", icon: CircleHelp, className: "bg-sky-50 text-sky-800 ring-sky-600/25" },
  // Not in inventory is routine (PRD principle 3), so it gets neutral styling, never error colors.
  none: { label: "None", icon: CircleMinus, className: "bg-neutral-100 text-neutral-700 ring-neutral-500/20" },
  manual: { label: "Added", icon: Pencil, className: "bg-neutral-100 text-neutral-700 ring-neutral-500/20" },
};

/** Match confidence as an icon plus text, never color alone (REV-2). `null` is a hand-added line. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
  const { label, icon: Icon, className } = styles[confidence ?? "manual"];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium ring-1 ring-inset",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
      {confidence && <span className="sr-only"> confidence</span>}
    </span>
  );
}
