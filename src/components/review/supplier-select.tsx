"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import type { Offer } from "@/lib/contracts";
import { unitPriceCents } from "@/lib/pricing";
import { formatCents, formatCount } from "./format";

type Props = {
  offers: Offer[];
  supplier: string;
  markupBps: number;
  label: string;
  onChange: (supplier: string) => void;
};

const columns = "grid grid-cols-[1rem_minmax(10rem,1fr)_4.5rem_4.5rem_4rem] items-center gap-x-3";

/**
 * Picks one supplier offer for a part (MAT-5). The trigger shows only the supplier, to keep
 * rows compact. The popup lists every offer with on hand, unit price at the current markup,
 * and lead time, so the rep compares them side by side.
 */
export function SupplierSelect({ offers, supplier, markupBps, label, onChange }: Props) {
  return (
    <Select.Root value={supplier} onValueChange={(value) => value && onChange(value)}>
      <Select.Trigger
        aria-label={label}
        className="inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border border-neutral-200 bg-white pr-1 pl-2 text-xs text-neutral-800 shadow-xs outline-none select-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-400/60 data-popup-open:bg-neutral-50"
      >
        <Select.Value className="truncate" />
        <Select.Icon className="shrink-0 text-neutral-400">
          <ChevronsUpDown aria-hidden className="size-3.5" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} side="bottom" align="start" sideOffset={4} className="z-50">
          <Select.Popup className="max-h-[var(--available-height)] origin-[var(--transform-origin)] overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 text-xs shadow-lg outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <div aria-hidden className={`${columns} px-2.5 pt-1 pb-1.5 text-[11px] font-medium text-neutral-500`}>
              <span />
              <span>Supplier</span>
              <span className="text-right">On hand</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Lead</span>
            </div>
            <Select.List>
              {offers.map((offer) => (
                <Select.Item
                  key={offer.supplier}
                  value={offer.supplier}
                  label={offer.supplier}
                  className={`${columns} cursor-default px-2.5 py-1.5 text-neutral-800 tabular-nums outline-none select-none data-highlighted:bg-neutral-100`}
                >
                  <Select.ItemIndicator className="text-neutral-700">
                    <Check aria-hidden className="size-3.5" />
                  </Select.ItemIndicator>
                  <Select.ItemText className="col-start-2 truncate">{offer.supplier}</Select.ItemText>
                  <span className="text-right">
                    {formatCount(offer.qtyOnHand)}
                    <span className="sr-only"> on hand</span>
                  </span>
                  <span className="text-right">{formatCents(unitPriceCents(offer.unitCostCents, markupBps))}</span>
                  <span className="text-right">
                    {offer.leadTimeDays} d<span className="sr-only">ays lead time</span>
                  </span>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
