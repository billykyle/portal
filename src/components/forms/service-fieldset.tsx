"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  isExclusiveIndustry,
  SCHEDULING_INDUSTRIES,
  schedulingServiceId,
  toggleSchedulingService,
} from "@/lib/scheduling/services";

export function ServiceFieldset({
  selected,
  name = "service",
  onSelectedChange,
}: {
  selected: string[];
  name?: string;
  onSelectedChange?: (services: string[]) => void;
}) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const [picked, setPicked] = useState(selected);
  const pickedRef = useRef(picked);
  pickedRef.current = picked;
  const [error, setError] = useState("");
  const [openIndustries, setOpenIndustries] = useState<string[]>(() =>
    industriesWithSelection(selected),
  );

  useEffect(() => {
    const maybeForm = fieldsetRef.current?.form;
    if (!maybeForm) return;
    const owner: HTMLFormElement = maybeForm;
    function onSubmit(event: Event) {
      if (pickedRef.current.length === 0) {
        event.preventDefault();
        setError("Pick at least one service.");
      }
    }
    owner.addEventListener("submit", onSubmit);
    return () => owner.removeEventListener("submit", onSubmit);
  }, []);

  function toggle(value: string) {
    setPicked((current) => {
      const next = toggleSchedulingService(current, value);
      onSelectedChange?.(next);
      return next;
    });
    setError("");
  }

  return (
    <fieldset ref={fieldsetRef} className="flex flex-col gap-3">
      <legend className="text-[16px] font-normal text-white">Services</legend>
      <p className="text-sm leading-6 text-[#8e8e93]">
        Tap to select or clear. At least one is required.
      </p>
      {picked.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <ul className="flex flex-col gap-2">
        {SCHEDULING_INDUSTRIES.map((group) => {
          const open = openIndustries.includes(group.industry);
          const exclusive = isExclusiveIndustry(group);
          const selectedOptions = group.options.filter((option) =>
            picked.includes(schedulingServiceId(group.industry, option)),
          );
          return (
            <li key={group.industry}>
              <Collapsible
                open={open}
                onOpenChange={(next) => {
                  setOpenIndustries((current) =>
                    next
                      ? current.includes(group.industry)
                        ? current
                        : [...current, group.industry]
                      : current.filter((industry) => industry !== group.industry),
                  );
                }}
              >
                <div
                  className={`rounded-xl border ${
                    selectedOptions.length > 0 ? "border-white bg-white/5" : "border-white/10"
                  }`}
                >
                  <CollapsibleTrigger
                    type="button"
                    aria-label={
                      selectedOptions.length > 0
                        ? `${group.industry}, ${selectedOptions.join(", ")} selected`
                        : group.industry
                    }
                    className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px]">{group.industry}</span>
                      {selectedOptions.length > 0 ? (
                        <span className="block text-sm text-[#8e8e93]">
                          {selectedOptions.join(", ")}
                        </span>
                      ) : exclusive ? (
                        <span className="block text-sm text-[#8e8e93]">Choose one</span>
                      ) : (
                        <span className="block text-sm text-[#8e8e93]">Select all that apply</span>
                      )}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={`size-5 shrink-0 text-[#8e8e93] transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <ul className="flex flex-col gap-2 px-3 pb-3">
                      {group.options.map((option) => {
                        const value = schedulingServiceId(group.industry, option);
                        const checked = picked.includes(value);
                        return (
                          <li key={value}>
                            <button
                              type="button"
                              aria-pressed={checked}
                              onClick={() => toggle(value)}
                              className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                                checked ? "border-white bg-white/5" : "border-white/10"
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`grid size-4 shrink-0 place-items-center border ${
                                  exclusive ? "rounded-full" : "rounded-[3px]"
                                } ${
                                  checked
                                    ? "border-white bg-white"
                                    : "border-white/50 bg-transparent"
                                }`}
                              >
                                {checked ? (
                                  exclusive ? (
                                    <span className="size-1.5 rounded-full bg-black" />
                                  ) : (
                                    <Check className="size-3 text-black" strokeWidth={3} />
                                  )
                                ) : null}
                              </span>
                              <span className="text-[15px]">{option}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
    </fieldset>
  );
}

function industriesWithSelection(selected: string[]) {
  return SCHEDULING_INDUSTRIES.filter((group) =>
    group.options.some((option) => selected.includes(schedulingServiceId(group.industry, option))),
  ).map((group) => group.industry);
}
