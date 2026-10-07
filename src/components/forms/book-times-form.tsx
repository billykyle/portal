"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { FormError, SubmitButton } from "@/components/field";
import { MonthCalendarDialog } from "@/components/forms/month-calendar";
import { TimesStepHeader } from "@/components/times-step-summary";
import { sectionLabelClass } from "@/components/phone-shell";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createBooking, updateBooking } from "@/lib/actions/scheduling";
import { adminPastExactStart, adminShootWindow } from "@/lib/scheduling/admin-time";
import type { AvailabilityResult, OfferedSlot } from "@/lib/scheduling/availability";
import { readBookingFormSlot, resolveSelectedSlot, toggleSelectedSlot } from "@/lib/scheduling/booking-form";
import {
  formatDateKeyLabel,
  formatWeekDayListLabel,
  parseRequiredDateKey,
  weekDateKeys,
} from "@/lib/scheduling/horizon";
import { TIMES_LOADING_COPY } from "@/lib/scheduling/times-loading";
import { schedulingEditorHref } from "@/lib/scheduling/urls";

export function BookTimesForm({
  availability,
  services,
  postedServices,
  commercialHours = null,
  notes = "",
  placeId = "",
  error,
  modifyBookingId,
  currentSlot,
  refreshing = false,
  stale = false,
  fromAdmin = false,
  heading = "Available times",
  intro,
  submitLabel,
  onAdvance,
  slotFieldName = "slot",
  extraHidden,
  preferredDateKey,
  defaultSlot = "",
  onBack,
  backLabel,
}: {
  availability: AvailabilityResult;
  services: string[];
  /** Hidden service fields. Defaults to the services shown in the heading. */
  postedServices?: string[];
  commercialHours?: number | null;
  notes?: string;
  placeId?: string;
  error?: string;
  modifyBookingId?: string;
  currentSlot?: string;
  refreshing?: boolean;
  stale?: boolean;
  fromAdmin?: boolean;
  heading?: string;
  intro?: string;
  submitLabel?: string;
  /** Step 1 of a Twilight pair: keep the choice on this page instead of booking. */
  onAdvance?: (slot: string) => void;
  slotFieldName?: string;
  extraHidden?: readonly { name: string; value: string }[];
  preferredDateKey?: string;
  defaultSlot?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  const slotsByDate = useMemo(() => groupSlotsByDate(availability.slots), [availability.slots]);
  const datesWithSlots = useMemo(() => new Set(slotsByDate.keys()), [slotsByDate]);
  const last = parseRequiredDateKey(availability.lastBookableDate);
  const currentStartSep = currentSlot?.indexOf("|") ?? -1;
  const currentStart = currentSlot && currentStartSep > 0 ? currentSlot.slice(0, currentStartSep) : "";
  const offeredCurrent = currentSlot
    ? availability.slots.find((slot) => `${slot.start}|${slot.end}` === currentSlot) ??
      availability.slots.find((slot) => slot.start === currentStart)
    : undefined;
  const preferredKey = preferredDateKey && datesWithSlots.has(preferredDateKey) ? preferredDateKey : "";
  const firstKey = offeredCurrent?.dateKey ?? (preferredKey || availability.firstBookableDate);
  const offeredDefault =
    defaultSlot && availability.slots.some((slot) => `${slot.start}|${slot.end}` === defaultSlot) ? defaultSlot : "";
  const [weekStart, setWeekStart] = useState(firstKey);
  const [openDates, setOpenDates] = useState<string[]>(() =>
    preferredKey
      ? [preferredKey]
      : firstOpenDate(weekDateKeys(parseRequiredDateKey(firstKey), last), datesWithSlots),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(
    offeredCurrent ? `${offeredCurrent.start}|${offeredCurrent.end}` : offeredDefault,
  );
  const [slotError, setSlotError] = useState("");
  const selectedSlotRef = useRef(selectedSlot);
  const exactEdited = useRef(false);
  const exactSlotRef = useRef<HTMLInputElement>(null);
  const pastExact = fromAdmin ? adminPastExactStart(currentSlot, availability.timeZone) : null;
  const slotSignature = availability.slots.map((slot) => `${slot.start}|${slot.end}`).join("\n");

  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);

  useEffect(() => {
    const current = selectedSlotRef.current;
    const next = resolveSelectedSlot(current, availability.slots, currentSlot);
    if (next === current) return;
    setSelectedSlot(next);
    const slot = availability.slots.find((item) => `${item.start}|${item.end}` === next);
    if (!slot) return;
    setWeekStart(slot.dateKey);
    setOpenDates([slot.dateKey]);
  }, [availability.slots, currentSlot, slotSignature]);

  const weekKeys = weekDateKeys(parseRequiredDateKey(weekStart), last);
  const changeHref = schedulingEditorHref({ fromAdmin, bookingId: modifyBookingId });
  const submitError = slotError || error;
  const submittedServices = postedServices ?? services;

  useEffect(() => {
    if (!error) return;
    document.getElementById("book-shoot-error")?.scrollIntoView({ block: "center" });
  }, [error]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (onAdvance) {
      event.preventDefault();
      if (!selectedSlot) {
        setSlotError("Pick a time.");
        return;
      }
      onAdvance(selectedSlot);
      return;
    }
    const form = event.currentTarget;
    if (fromAdmin) {
      const date = String(new FormData(form).get("exactDate") ?? "").trim();
      const time = String(new FormData(form).get("exactTime") ?? "").trim();
      const useExact = Boolean(date || time) && (exactEdited.current || !selectedSlot);
      if (useExact) {
        if (!date || !time) {
          event.preventDefault();
          setSlotError("Enter a date and time.");
          return;
        }
        const window = adminShootWindow(date, time, services, availability.timeZone, commercialHours);
        if (!window || exactSlotRef.current == null) {
          event.preventDefault();
          setSlotError("Could not read that time.");
          return;
        }
        exactSlotRef.current.value = `${window.start.toISOString()}|${window.end.toISOString()}`;
        setSlotError("");
        return;
      }
      if (exactSlotRef.current) exactSlotRef.current.value = "";
    }
    if (readBookingFormSlot(new FormData(form))) {
      setSlotError("");
      return;
    }
    event.preventDefault();
    setSlotError("Pick a time.");
  }

  function focusDate(dateKey: string) {
    if (!datesWithSlots.has(dateKey)) return;
    const inWeek = weekKeys.includes(dateKey);
    if (!inWeek) {
      setWeekStart(dateKey);
    }
    setOpenDates([dateKey]);
  }

  return (
    <div>
      <TimesStepHeader address={availability.address} services={services} changeHref={changeHref} />

      <h2 className={`${sectionLabelClass} mt-8`}>{heading}</h2>
      {intro ? <p className="mb-4 text-sm leading-6 text-[#c7c7cc]">{intro}</p> : null}
      {refreshing ? (
        <p className="mb-4 text-sm text-[#8e8e93]" role="status" aria-live="polite" aria-busy="true">
          {TIMES_LOADING_COPY}
        </p>
      ) : null}
      {availability.notices.map((notice) => (
        <p key={notice} className="mb-4 text-sm leading-6 text-[#c7c7cc]">
          {notice}
        </p>
      ))}
      {availability.slots.length === 0 && !refreshing ? (
        <p className="mb-4 text-sm text-[#8e8e93]">No times fit this address right now.</p>
      ) : null}

      <form
        action={onAdvance ? undefined : modifyBookingId ? updateBooking : createBooking}
        onSubmit={onSubmit}
        className="flex flex-col gap-6"
      >
        {modifyBookingId ? <input type="hidden" name="bookingId" value={modifyBookingId} /> : null}
        {fromAdmin ? <input type="hidden" name="fromAdmin" value="1" /> : null}
        {fromAdmin ? <input ref={exactSlotRef} type="hidden" name="slot" defaultValue="" /> : null}
        <input type="hidden" name="address" value={availability.address} />
        <input type="hidden" name="placeId" value={placeId} />
        {submittedServices.map((service) => (
          <input key={service} type="hidden" name="service" value={service} />
        ))}
        {extraHidden?.map((field) => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}
        {commercialHours != null ? <input type="hidden" name="commercialHours" value={commercialHours} /> : null}
        <input type="hidden" name="notes" value={notes} />
        {selectedSlot ? <input type="hidden" name={slotFieldName} value={selectedSlot} /> : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Choose a date and time</legend>
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3">
            {weekKeys.map((dateKey) => {
              const slots = slotsByDate.get(dateKey) ?? [];
              const hasSlots = slots.length > 0;
              const dateLabel = slots[0]?.dateLabel ?? formatDateKeyLabel(dateKey, availability.timeZone);
              const displayLabel = formatWeekDayListLabel(dateLabel, hasSlots);
              if (!hasSlots) {
                return (
                  <li key={dateKey}>
                    <div className="rounded-xl border border-white/10">
                      <p
                        aria-disabled="true"
                        className="flex min-h-12 w-full cursor-not-allowed items-center px-4 py-3 text-left text-[15px] text-[#636366]"
                      >
                        {displayLabel}
                      </p>
                    </div>
                  </li>
                );
              }
              const open = openDates.includes(dateKey);
              return (
                <li key={dateKey}>
                  <Collapsible
                    open={open}
                    onOpenChange={(next) => {
                      setOpenDates((current) =>
                        next
                          ? current.includes(dateKey)
                            ? current
                            : [...current, dateKey]
                          : current.filter((key) => key !== dateKey),
                      );
                    }}
                  >
                    <div className={`rounded-xl border ${open ? "border-white bg-white/5" : "border-white/10"}`}>
                      <CollapsibleTrigger
                        type="button"
                        aria-label={displayLabel}
                        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="text-[15px]">{displayLabel}</span>
                        <ChevronDown
                          aria-hidden
                          className={`size-5 shrink-0 text-[#8e8e93] transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent keepMounted>
                        <div className="px-3 pb-3">
                          <ul className="grid gap-2 sm:grid-cols-2">
                            {slots.map((slot) => {
                              const value = `${slot.start}|${slot.end}`;
                              const checked = selectedSlot === value;
                              return (
                                <li key={slot.start}>
                                  <label className={timeOptionClassName(checked)}>
                                    <input
                                      type="radio"
                                      name={slotFieldName}
                                      value={value}
                                      checked={checked}
                                      onClick={() => {
                                        setSelectedSlot((current) => toggleSelectedSlot(current, value));
                                        setSlotError("");
                                      }}
                                      onChange={() => {
                                        setSelectedSlot(value);
                                        setSlotError("");
                                      }}
                                      className="size-4 accent-white"
                                    />
                                    <span className="text-[15px]">{slot.timeLabel}</span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                </li>
              );
            })}
          </ul>
        </fieldset>
        {fromAdmin ? (
          <div className="flex flex-col gap-4">
            <h2 className={sectionLabelClass}>Exact start</h2>
            <p className="text-sm text-[#8e8e93]">
              A time that is already in the past can be typed here. Clear these to use one of the open slots.
            </p>
            <div className="flex flex-col gap-2">
              <label htmlFor="exact-date" className="text-[16px] font-normal text-white">
                Date
              </label>
              <input
                id="exact-date"
                name="exactDate"
                type="date"
                defaultValue={pastExact?.date ?? ""}
                onChange={() => {
                  exactEdited.current = true;
                }}
                className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="exact-time" className="text-[16px] font-normal text-white">
                Time
              </label>
              <input
                id="exact-time"
                name="exactTime"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="10:30am"
                defaultValue={pastExact?.time ?? ""}
                onChange={() => {
                  exactEdited.current = true;
                }}
                className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
              />
            </div>
          </div>
        ) : null}
        <div id="book-shoot-error" className="flex flex-col gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/10 text-[15px]"
            >
              {backLabel ?? "Back"}
            </button>
          ) : null}
          <FormError message={submitError} />
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-3">
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-white/10 text-[15px]"
            >
              Date options further out
            </button>
            <BookShootSubmit modify={Boolean(modifyBookingId)} disabled={stale} label={submitLabel} />
          </div>
        </div>
      </form>

      <MonthCalendarDialog
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        selectedKey={openDates[0] ?? weekStart}
        firstBookableDate={availability.firstBookableDate}
        lastBookableDate={availability.lastBookableDate}
        datesWithSlots={datesWithSlots}
        onSelect={focusDate}
      />
    </div>
  );
}

function firstOpenDate(weekKeys: string[], datesWithSlots: Set<string>) {
  const first = weekKeys.find((key) => datesWithSlots.has(key));
  return first ? [first] : [];
}

/** Same box on every time so the selected border does not change row width. */
const timeOptionLayoutClass =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3";

function timeOptionClassName(checked: boolean) {
  return checked
    ? `${timeOptionLayoutClass} border-white bg-white/5`
    : `${timeOptionLayoutClass} border-transparent`;
}

function groupSlotsByDate(slots: OfferedSlot[]) {
  const groups = new Map<string, OfferedSlot[]>();
  for (const slot of slots) {
    const list = groups.get(slot.dateKey);
    if (list) list.push(slot);
    else groups.set(slot.dateKey, [slot]);
  }
  return groups;
}

function BookShootSubmit({
  modify,
  disabled,
  label,
}: {
  modify?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const { pending } = useFormStatus();
  const text = label
    ? pending
      ? "Booking…"
      : label
    : modify
      ? pending
        ? "Saving…"
        : "Save changes"
      : pending
        ? "Booking…"
        : "Book shoot";
  return <SubmitButton disabled={pending || disabled}>{text}</SubmitButton>;
}
