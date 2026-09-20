"use client";

import { ChevronDown } from "lucide-react";
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
}: {
  selected: string[];
  name?: string;
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
    setPicked((current) => toggleSchedulingService(current, value));
    setError("");
  }

  return (
    <fieldset ref={fieldsetRef} className="flex flex-col gap-3">
      <legend className="text-[16px] font-normal text-white">Services</legend>
      <p className="text-sm leading-6 text-[#8e8e93]">Select all that apply. At least one is required.</p>
      {picked.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <ul className="flex flex-col gap-2">
        {SCHEDULING_INDUSTRIES.map((group) => {
          const open = openIndustries.includes(group.industry);
          const exclusive = isExclusiveIndustry(group);
          const selectedCount = group.options.filter((option) =>
            picked.includes(schedulingServiceId(group.industry, option)),
          ).length;
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
                    selectedCount > 0 ? "border-white bg-white/5" : "border-white/10"
                  }`}
                >
                  <CollapsibleTrigger
                    type="button"
                    aria-label={
                      selectedCount > 0
                        ? `${group.industry}, ${selectedCount} selected`
                        : group.industry
                    }
                    className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-[15px]">{group.industry}</span>
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
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 has-[:checked]:border-white has-[:checked]:bg-white/5">
                              <input
                                type={exclusive ? "radio" : "checkbox"}
                                checked={checked}
                                onChange={() => {
                                  if (!checked) toggle(value);
                                }}
                                onClick={() => {
                                  if (exclusive && checked) toggle(value);
                                }}
                                className="size-4 shrink-0 accent-white"
                              />
                              <span className="text-[15px]">{option}</span>
                            </label>
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
