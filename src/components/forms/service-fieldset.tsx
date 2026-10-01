"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  COMMERCIAL_VIDEO_SERVICE,
  commercialHourLabel,
  includesCommercialVideo,
  isExclusiveIndustry,
  parseCommercialVideoHours,
  SCHEDULING_INDUSTRIES,
  schedulingServiceId,
  SOCIAL_MEDIA_VIDEO_LABEL,
  SOCIAL_MEDIA_VIDEO_OPTIONS,
  toggleSchedulingService,
} from "@/lib/scheduling/services";

const COMMERCIAL_HOURS_MESSAGE = "Enter whole hours from 1 through 8.";
const COMMERCIAL_VIDEO_LABEL = "Commercial Video";
const SOCIAL_MEDIA_HINT = "Select all that apply";

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
  const [hoursText, setHoursText] = useState(commercialHours != null ? String(commercialHours) : "");
  const [commercialOpen, setCommercialOpen] = useState(() => selected.includes(COMMERCIAL_VIDEO_SERVICE));
  const [socialOpen, setSocialOpen] = useState(() => selected.some(isSocialMediaOption));
  const hoursId = useId();
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
        setCommercialOpen(true);
        setError(COMMERCIAL_HOURS_MESSAGE);
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

  function applyHoursText(text: string) {
    const parsed = parseCommercialVideoHours(text);
    const chooseService = text.trim() !== "";
    setHoursText(text);
    setHours(parsed);
    onCommercialHoursChange?.(parsed);
    const hasService = picked.includes(COMMERCIAL_VIDEO_SERVICE);
    if (hasService !== chooseService) {
      const next = toggleSchedulingService(picked, COMMERCIAL_VIDEO_SERVICE);
      setPicked(next);
      onSelectedChange?.(next);
    }
    setError("");
  }

  const commercial = picked.includes(COMMERCIAL_VIDEO_SERVICE);
  const hoursInvalid = hoursText.trim() !== "" && hours == null;
  const hoursSummary = hours != null ? commercialHourLabel(hours) : null;

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
          <Collapsible open={commercialOpen} onOpenChange={setCommercialOpen}>
            <div
              className={`rounded-xl border ${
                commercial ? "border-white bg-white/5" : "border-white/10"
              }`}
            >
              <CollapsibleTrigger
                type="button"
                aria-label={
                  hoursSummary
                    ? `${COMMERCIAL_VIDEO_LABEL}, ${hoursSummary} selected`
                    : COMMERCIAL_VIDEO_LABEL
                }
                className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[15px]">{COMMERCIAL_VIDEO_LABEL}</span>
                  <span className="block text-sm text-[#8e8e93]">Select your hours</span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={`size-5 shrink-0 text-[#8e8e93] transition-transform ${
                    commercialOpen ? "rotate-180" : ""
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3">
                  <label htmlFor={hoursId} className="sr-only">
                    Hours
                  </label>
                  <input
                    id={hoursId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={hoursText}
                    placeholder="Hours"
                    aria-invalid={hoursInvalid}
                    onChange={(event) => applyHoursText(event.target.value)}
                    className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
                  />
                  {hoursInvalid || error === COMMERCIAL_HOURS_MESSAGE ? (
                    <p className="mt-2 text-sm text-[#a1a1a1]">{COMMERCIAL_HOURS_MESSAGE}</p>
                  ) : null}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </li>
        <li>
          <Collapsible open={socialOpen} onOpenChange={setSocialOpen}>
            <div
              className={`rounded-xl border ${
                socialSelected(picked).length > 0 ? "border-white bg-white/5" : "border-white/10"
              }`}
            >
              <CollapsibleTrigger
                type="button"
                aria-label={socialAriaLabel(picked)}
                className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[15px]">{SOCIAL_MEDIA_VIDEO_LABEL}</span>
                  <span className="block text-sm text-[#8e8e93]">{SOCIAL_MEDIA_HINT}</span>
                </span>
                <ChevronDown
                  aria-hidden
                  className={`size-5 shrink-0 text-[#8e8e93] transition-transform ${
                    socialOpen ? "rotate-180" : ""
                  }`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="grid grid-cols-1 gap-2 px-3 pb-3 lg:grid-cols-2">
                  {SOCIAL_MEDIA_VIDEO_OPTIONS.map((option) => {
                    const checked = picked.includes(option.id);
                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          aria-pressed={checked}
                          onClick={() => toggle(option.id)}
                          className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                            checked ? "border-white bg-white/5" : "border-white/10"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`grid size-4 shrink-0 place-items-center rounded-[3px] border ${
                              checked ? "border-white bg-white" : "border-white/50 bg-transparent"
                            }`}
                          >
                            {checked ? <Check className="size-3 text-black" strokeWidth={3} /> : null}
                          </span>
                          <span className="text-[15px]">{option.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleContent>
            </div>
          </Collapsible>
        </li>
      </ul>
      {error && error !== COMMERCIAL_HOURS_MESSAGE ? (
        <p className="text-sm text-[#a1a1a1]">{error}</p>
      ) : null}
    </fieldset>
  );
}

function isSocialMediaOption(value: string) {
  return SOCIAL_MEDIA_VIDEO_OPTIONS.some((option) => option.id === value);
}

function socialSelected(picked: readonly string[]) {
  return SOCIAL_MEDIA_VIDEO_OPTIONS.filter((option) => picked.includes(option.id));
}

function socialAriaLabel(picked: readonly string[]) {
  const selected = socialSelected(picked);
  if (selected.length === 0) return SOCIAL_MEDIA_VIDEO_LABEL;
  return `${SOCIAL_MEDIA_VIDEO_LABEL}, ${selected.map((option) => option.label).join(", ")} selected`;
}

function industriesWithSelection(selected: string[]) {
  return SCHEDULING_INDUSTRIES.filter((group) =>
    group.options.some((option) => selected.includes(schedulingServiceId(group.industry, option))),
  ).map((group) => group.industry);
}
