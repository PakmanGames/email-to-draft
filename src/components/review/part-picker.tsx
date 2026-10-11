"use client";

import type { Candidate } from "@/lib/contracts";
import { CandidateSummary } from "./candidate-summary";
import { PartSearch } from "./part-search";
import type { LineView } from "./review-model";

type Props = {
  view: LineView;
  markupBps: number;
  onPick: (candidate: Candidate) => void;
  onKeepUnmatched: () => void;
};

const optionClass =
  "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white has-checked:bg-white has-checked:ring-1 has-checked:ring-neutral-300";
const radioClass = "mt-[3px] size-3.5 shrink-0 accent-neutral-900";

/**
 * The part decision for one line (REV-3, REV-6): matching's candidates best first, "Keep
 * unmatched", and an inventory search for anything else. Nothing is checked until the rep
 * decides, which is how a Low line shows it still needs a choice.
 */
export function PartPicker({ view, markupBps, onPick, onKeepUnmatched }: Props) {
  const { line, number } = view;
  const name = `part-${line.key}`;
  const { selection } = line;

  const search = (
    <PartSearch
      label={`Search inventory for line ${number}`}
      placeholder="Search inventory by part number, NSN, or description"
      markupBps={markupBps}
      onPick={onPick}
    />
  );

  // With nothing to choose between yet (a None line), the search box stands on its own.
  if (line.candidates.length === 0) {
    return (
      <div id={`line-${line.key}-choice`} role="group" aria-label={`Part for line ${number}`}>
        {search}
      </div>
    );
  }

  return (
    <fieldset id={`line-${line.key}-choice`} className="space-y-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1.5">
      <legend className="sr-only">Part for line {number}</legend>
      <div className="space-y-0.5">
        {line.candidates.map((candidate) => (
          <label key={candidate.partNumber} className={optionClass}>
            <input
              type="radio"
              name={name}
              value={candidate.partNumber}
              checked={selection?.kind === "part" && selection.partNumber === candidate.partNumber}
              onChange={() => onPick(candidate)}
              aria-label={`${candidate.partNumber}, ${candidate.description}`}
              className={radioClass}
            />
            <div className="min-w-0 flex-1">
              <CandidateSummary candidate={candidate} markupBps={markupBps} />
            </div>
          </label>
        ))}
        <label className={optionClass}>
          <input
            type="radio"
            name={name}
            value=""
            checked={selection?.kind === "unmatched"}
            onChange={onKeepUnmatched}
            className={radioClass}
          />
          <span className="text-[13px] text-neutral-900">
            Keep unmatched <span className="text-xs text-neutral-500">· quoted without a price</span>
          </span>
        </label>
      </div>
      <div className="px-0.5 pb-0.5">{search}</div>
    </fieldset>
  );
}
