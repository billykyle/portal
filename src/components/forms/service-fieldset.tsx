"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  COMMERCIAL_VIDEO_HOUR_OPTIONS,
  COMMERCIAL_VIDEO_HOURS_ERROR,
  COMMERCIAL_VIDEO_SERVICE,
  commercialHourLabel,
  includesCommercialVideo,
  isExclusiveIndustry,
  SCHEDULING_INDUSTRIES,
  schedulingServiceId,
  toggleSchedulingService,
} from "@/lib/scheduling/services";

export function ServiceFieldset({
  selected,
  commercialHours = null,
  name = "service",
  onSelectedChange,
  onCommercialHoursChange,
}: {
  selected: string[];
  commercialHours?: number | null;
  name?: string;
  onSelectedChange?: (services: string[]) => void;
  onCommercialHoursChange?: (hours: number | null) => void;
}) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const [picked, setPicked] = useState(selected);
  const pickedRef = useRef(picked);
  const [hours, setHours] = useState<number | null>(commercialHours);
  const hoursRef = useRef(hours);
  const [error, setError] = useState("");
  const [openIndustries, setOpenIndustries] = useState<string[]>(() =>
    industriesWithSelection(selected),
  );

  useEffect(() => {
    pickedRef.current = picked;
    hoursRef.current = hours;
  }, [hours, picked]);

  useEffect(() => {
    const maybeForm = fieldsetRef.current?.form;
    if (!maybeForm) return;
    const owner: HTMLFormElement = maybeForm;
    function onSubmit(event: Event) {
      if (pickedRef.current.length === 0) {
        event.preventDefault();
        setError("Pick at least one service.");
        return;
      }
      if (includesCommercialVideo(pickedRef.current) && hoursRef.current == null) {
        event.preventDefault();
        setError(COMMERCIAL_VIDEO_HOURS_ERROR);
      }
    }
    owner.addEventListener("submit", onSubmit);
    return () => owner.removeEventListener("submit", onSubmit);
  }, []);

  function toggle(value: string) {
    setPicked((current) => {
      const next = toggleSchedulingService(current, value);
      onSelectedChange?.(next);
      if (!includesCommercialVideo(next)) {
        setHours(null);
        onCommercialHoursChange?.(null);
      }
      return next;
    });
    setError("");
  }

  function chooseHours(next: number) {
    setHours(next);
    onCommercialHoursChange?.(next);
    setError("");
  }

  const commercial = picked.includes(COMMERCIAL_VIDEO_SERVICE);

  return (
    <fieldset ref={fieldsetRef} className="flex flex-col gap-3">
      <legend className="text-[16px] font-normal text-white">Services</legend>
      <p className="text-sm leading-6 text-[#8e8e93]">
        Tap to select or clear. At least one is required.
      </p>
      {picked.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      {commercial && hours != null ? <input type="hidden" name="commercialHours" value={hours} /> : null}
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
                    <ul className="grid grid-cols-1 gap-2 px-3 pb-3 lg:grid-cols-2">
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
        <li>
          <div
            className={`rounded-xl border ${
              commercial ? "border-white bg-white/5" : "border-white/10"
            }`}
          >
            <button
              type="button"
              aria-pressed={commercial}
              onClick={() => toggle(COMMERCIAL_VIDEO_SERVICE)}
              className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
            >
              <span
                aria-hidden
                className={`grid size-4 shrink-0 place-items-center rounded-[3px] border ${
                  commercial ? "border-white bg-white" : "border-white/50 bg-transparent"
                }`}
              >
                {commercial ? <Check className="size-3 text-black" strokeWidth={3} /> : null}
              </span>
              <span className="text-[15px]">{COMMERCIAL_VIDEO_SERVICE}</span>
            </button>
            {commercial ? (
              <div className="grid grid-cols-2 gap-2 px-3 pb-3 lg:grid-cols-4">
                {COMMERCIAL_VIDEO_HOUR_OPTIONS.map((option) => {
                  const checked = hours === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => chooseHours(option)}
                      className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-[15px] text-white ${
                        checked ? "border-white bg-white/5" : "border-white/10"
                      }`}
                    >
                      {commercialHourLabel(option)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </li>
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
