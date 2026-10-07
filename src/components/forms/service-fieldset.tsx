"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  COMMERCIAL_VIDEO_SERVICE,
  commercialHourLabel,
  includesCommercialVideo,
  isExclusiveIndustry,
  MEETING_LABEL,
  MEETING_OPTIONS,
  parseCommercialVideoHours,
  parseSchedulingServices,
  SCHEDULING_INDUSTRIES,
  schedulingServiceId,
  SOCIAL_MEDIA_VIDEO_LABEL,
  SOCIAL_MEDIA_VIDEO_OPTIONS,
  toggleSchedulingService,
} from "@/lib/scheduling/services";

const COMMERCIAL_HOURS_MESSAGE = "Enter whole hours from 1 through 8.";
const COMMERCIAL_VIDEO_LABEL = "Commercial Video";
const EXCLUSIVE_HINT = "Select one that applies";
const MULTI_HINT = "Select all that apply";

export function ServiceFieldset({
  selected,
  commercialHours = null,
  name = "service",
  allowedServices,
  pairTwilight = false,
  onSelectedChange,
  onCommercialHoursChange,
}: {
  selected: string[];
  commercialHours?: number | null;
  name?: string;
  /** When set, only these services are shown and submitted. Omit to show the full catalog. */
  allowedServices?: readonly string[];
  /** New client bookings may add Twilight beside other services. */
  pairTwilight?: boolean;
  onSelectedChange?: (services: string[]) => void;
  onCommercialHoursChange?: (hours: number | null) => void;
}) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const allowed = allowedServices ? new Set(allowedServices) : null;
  const initial = parseSchedulingServices(selected).filter((service) => serviceAllowed(allowed, service));
  const [picked, setPicked] = useState(initial);
  const pickedRef = useRef(picked);
  const [hours, setHours] = useState<number | null>(commercialHours);
  const hoursRef = useRef(hours);
  const [hoursText, setHoursText] = useState(commercialHours != null ? String(commercialHours) : "");
  const [commercialOpen, setCommercialOpen] = useState(() => initial.includes(COMMERCIAL_VIDEO_SERVICE));
  const [socialOpen, setSocialOpen] = useState(() => initial.some(isSocialMediaOption));
  const [meetingOpen, setMeetingOpen] = useState(() => initial.some(isMeetingOption));
  const hoursId = useId();
  const [error, setError] = useState("");
  const [openIndustries, setOpenIndustries] = useState<string[]>(() =>
    industriesWithSelection(initial),
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
    const next = toggleSchedulingService(picked, value, { pairTwilight });
    setPicked(next);
    onSelectedChange?.(next);
    if (!includesCommercialVideo(next)) {
      setHours(null);
      onCommercialHoursChange?.(null);
    }
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
      const next = toggleSchedulingService(picked, COMMERCIAL_VIDEO_SERVICE, { pairTwilight });
      setPicked(next);
      onSelectedChange?.(next);
    }
    setError("");
  }

  function setIndustryOpen(industry: string, next: boolean) {
    setOpenIndustries((current) =>
      next
        ? current.includes(industry)
          ? current
          : [...current, industry]
        : current.filter((item) => item !== industry),
    );
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
        <IndustryGroup
          group={industryNamed("Real Estate")}
          allowed={allowed}
          open={openIndustries.includes("Real Estate")}
          picked={picked}
          onOpenChange={(next) => setIndustryOpen("Real Estate", next)}
          onToggle={toggle}
        />
        <ExclusiveChoices
          label={SOCIAL_MEDIA_VIDEO_LABEL}
          options={SOCIAL_MEDIA_VIDEO_OPTIONS.filter((option) => serviceAllowed(allowed, option.id))}
          picked={picked}
          open={socialOpen}
          onOpenChange={setSocialOpen}
          onToggle={toggle}
        />
        <IndustryGroup
          group={industryNamed("Podcast")}
          allowed={allowed}
          open={openIndustries.includes("Podcast")}
          picked={picked}
          onOpenChange={(next) => setIndustryOpen("Podcast", next)}
          onToggle={toggle}
        />
        <IndustryGroup
          group={industryNamed("Construction")}
          allowed={allowed}
          open={openIndustries.includes("Construction")}
          picked={picked}
          onOpenChange={(next) => setIndustryOpen("Construction", next)}
          onToggle={toggle}
        />
        {serviceAllowed(allowed, COMMERCIAL_VIDEO_SERVICE) ? (
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
        ) : null}
        <ExclusiveChoices
          label={MEETING_LABEL}
          options={MEETING_OPTIONS.filter((option) => serviceAllowed(allowed, option.id))}
          picked={picked}
          open={meetingOpen}
          onOpenChange={setMeetingOpen}
          onToggle={toggle}
        />
      </ul>
      {error && error !== COMMERCIAL_HOURS_MESSAGE ? (
        <p className="text-sm text-[#a1a1a1]">{error}</p>
      ) : null}
    </fieldset>
  );
}

function IndustryGroup({
  group,
  allowed,
  open,
  picked,
  onOpenChange,
  onToggle,
}: {
  group: (typeof SCHEDULING_INDUSTRIES)[number];
  allowed: ReadonlySet<string> | null;
  open: boolean;
  picked: readonly string[];
  onOpenChange: (open: boolean) => void;
  onToggle: (value: string) => void;
}) {
  const options = group.options.filter((option) =>
    serviceAllowed(allowed, schedulingServiceId(group.industry, option)),
  );
  if (options.length === 0) return null;
  const exclusive = isExclusiveIndustry(group);
  const selectedOptions = options.filter((option) =>
    picked.includes(schedulingServiceId(group.industry, option)),
  );
  return (
    <li>
      <Collapsible open={open} onOpenChange={onOpenChange}>
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
                <span className="block text-sm text-[#8e8e93]">{selectedOptions.join(", ")}</span>
              ) : exclusive ? (
                <span className="block text-sm text-[#8e8e93]">{EXCLUSIVE_HINT}</span>
              ) : (
                <span className="block text-sm text-[#8e8e93]">{MULTI_HINT}</span>
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
              {options.map((option) => {
                const value = schedulingServiceId(group.industry, option);
                const checked = picked.includes(value);
                return (
                  <li key={value}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => onToggle(value)}
                      className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                        checked ? "border-white bg-white/5" : "border-white/10"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid size-4 shrink-0 place-items-center border ${
                          exclusive ? "rounded-full" : "rounded-[3px]"
                        } ${checked ? "border-white bg-white" : "border-white/50 bg-transparent"}`}
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
}

function ExclusiveChoices({
  label,
  options,
  picked,
  open,
  onOpenChange,
  onToggle,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  picked: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  const selected = options.filter((option) => picked.includes(option.id));
  return (
    <li>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <div
          className={`rounded-xl border ${
            selected.length > 0 ? "border-white bg-white/5" : "border-white/10"
          }`}
        >
          <CollapsibleTrigger
            type="button"
            aria-label={
              selected.length > 0
                ? `${label}, ${selected.map((option) => option.label).join(", ")} selected`
                : label
            }
            className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[15px]">{label}</span>
              <span className="block text-sm text-[#8e8e93]">{EXCLUSIVE_HINT}</span>
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
              {options.map((option) => {
                const checked = picked.includes(option.id);
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => onToggle(option.id)}
                      className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                        checked ? "border-white bg-white/5" : "border-white/10"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid size-4 shrink-0 place-items-center rounded-full border ${
                          checked ? "border-white bg-white" : "border-white/50 bg-transparent"
                        }`}
                      >
                        {checked ? <span className="size-1.5 rounded-full bg-black" /> : null}
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
  );
}

function serviceAllowed(allowed: ReadonlySet<string> | null, id: string) {
  return !allowed || allowed.has(id);
}

function industryNamed(name: "Real Estate" | "Podcast" | "Construction") {
  const group = SCHEDULING_INDUSTRIES.find((item) => item.industry === name);
  if (!group) throw new Error(`Missing scheduling industry ${name}`);
  return group;
}

function isSocialMediaOption(value: string) {
  return SOCIAL_MEDIA_VIDEO_OPTIONS.some((option) => option.id === value);
}

function isMeetingOption(value: string) {
  return MEETING_OPTIONS.some((option) => option.id === value);
}

function industriesWithSelection(selected: readonly string[]) {
  return SCHEDULING_INDUSTRIES.filter((group) =>
    group.options.some((option) => selected.includes(schedulingServiceId(group.industry, option))),
  ).map((group) => group.industry);
}
