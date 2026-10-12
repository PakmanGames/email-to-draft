import { CircleCheck, CircleHelp, CircleMinus, Pencil, type LucideIcon } from "lucide-react";
import type { Confidence } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const styles: Record<Confidence | "manual", { label: string; icon: LucideIcon; className: string }> = {
  high: { label: "High", icon: CircleCheck, className: "bg-success-surface text-success" },
  low: { label: "Low", icon: CircleHelp, className: "bg-attention-surface text-attention" },
  // Not in inventory is routine (PRD principle 3), so it gets neutral styling, never error colors.
  none: { label: "None", icon: CircleMinus, className: "bg-muted text-muted-foreground" },
  manual: { label: "Added", icon: Pencil, className: "bg-muted text-muted-foreground" },
};

/** Match confidence as an icon plus text, never color alone (REV-2). `null` is a hand-added line. */
export function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
  const { label, icon: Icon, className } = styles[confidence ?? "manual"];
  return (
    <span
      className={cn(
        "inline-flex h-[1.125rem] shrink-0 items-center gap-1 rounded-[5px] px-1.5 text-caption font-semibold",
        className,
      )}
    >
      <Icon aria-hidden className="size-3" strokeWidth={2.5} />
      {label}
      {confidence && <span className="sr-only"> confidence</span>}
    </span>
  );
}
