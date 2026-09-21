"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { FormError, SubmitButton } from "@/components/field";
import { MonthCalendarDialog } from "@/components/forms/month-calendar";
import { TimesHelpNote } from "@/components/times-help-note";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createBooking, updateBooking } from "@/lib/actions/scheduling";
import type { AvailabilityResult, OfferedSlot } from "@/lib/scheduling/availability";
import { readBookingFormSlot, toggleSelectedSlot } from "@/lib/scheduling/booking-form";
import {
  formatDateKeyLabel,
  formatWeekDayListLabel,
  parseRequiredDateKey,
  weekDateKeys,
} from "@/lib/scheduling/horizon";
import { TIMES_LOADING_COPY } from "@/lib/scheduling/times-loading";
import { initialExpandedDate, initialWeekStart } from "@/lib/scheduling/times-focus";
import { adminBookingHref, schedulingBookHref } from "@/lib/scheduling/urls";

export function BookTimesForm({
  availability,
  services,
  notes = "",
  error,
  modifyBookingId,
  currentSlot,
  refreshing = false,
  stale = false,
  fromAdmin = false,
}: {
  availability: AvailabilityResult;
  services: string[];
  notes?: string;
  error?: string;
  modifyBookingId?: string;
  currentSlot?: string;
  refreshing?: boolean;
  stale?: boolean;
  fromAdmin?: boolean;
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
  const expandedDate = initialExpandedDate({
    suggestedDate: availability.suggestedDate,
    currentDateKey: offeredCurrent?.dateKey,
    datesWithSlots,
  });
  const firstKey = initialWeekStart({
    expandedDate,
    firstBookableDate: availability.firstBookableDate,
    lastBookableDate: availability.lastBookableDate,
  });
  const [weekStart, setWeekStart] = useState(firstKey);
  const [openDates, setOpenDates] = useState<string[]>(() => (expandedDate ? [expandedDate] : []));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(
    offeredCurrent ? `${offeredCurrent.start}|${offeredCurrent.end}` : "",
  );
  const [slotError, setSlotError] = useState("");

  const weekKeys = weekDateKeys(parseRequiredDateKey(weekStart), last);
  const changeHref =
    fromAdmin && modifyBookingId
      ? adminBookingHref(modifyBookingId, {
          address: availability.address,
          services,
          notes: notes || null,
        })
      : schedulingBookHref({
          address: availability.address,
          services,
          notes: notes || null,
          modify: modifyBookingId || null,
        });
  const submitError = slotError || error;

  useEffect(() => {
    if (!error) return;
    document.getElementById("book-shoot-error")?.scrollIntoView({ block: "center" });
  }, [error]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (readBookingFormSlot(new FormData(event.currentTarget))) {
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
      {services.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {services.map((service) => (
            <li key={service} className="text-[15px]">
              {service}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={services.length > 0 ? "mt-1 text-sm text-[#8e8e93]" : "text-[15px]"}>
        {availability.address}
      </p>
      <Link href={changeHref} className="mt-2 inline-block text-sm text-[#8e8e93] underline">
        Change services or address
      </Link>
      <TimesHelpNote />

      <h2 className="mt-8 mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Available times</h2>
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

      <form action={modifyBookingId ? updateBooking : createBooking} onSubmit={onSubmit} className="flex flex-col gap-6">
        {modifyBookingId ? <input type="hidden" name="bookingId" value={modifyBookingId} /> : null}
        {fromAdmin ? <input type="hidden" name="fromAdmin" value="1" /> : null}
        <input type="hidden" name="address" value={availability.address} />
        {services.map((service) => (
          <input key={service} type="hidden" name="service" value={service} />
        ))}
        <input type="hidden" name="notes" value={notes} />
        {selectedSlot ? <input type="hidden" name="slot" value={selectedSlot} /> : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Choose a date and time</legend>
          <ul className="flex flex-col gap-2">
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
                                  <label
                                    className={
                                      checked
                                        ? "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-white bg-white/5 px-4 py-3"
                                        : "flex min-h-12 w-full cursor-pointer items-center gap-3 py-2"
                                    }
                                  >
                                    <input
                                      type="radio"
                                      name="slot"
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
        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-white/10 text-[15px]"
        >
          Date options further out
        </button>
        <div id="book-shoot-error">
          <FormError message={submitError} />
        </div>
        <BookShootSubmit modify={Boolean(modifyBookingId)} disabled={stale} />
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

function groupSlotsByDate(slots: OfferedSlot[]) {
  const groups = new Map<string, OfferedSlot[]>();
  for (const slot of slots) {
    const list = groups.get(slot.dateKey);
    if (list) list.push(slot);
    else groups.set(slot.dateKey, [slot]);
  }
  return groups;
}

function BookShootSubmit({ modify, disabled }: { modify?: boolean; disabled?: boolean }) {
  const { pending } = useFormStatus();
  const label = modify ? (pending ? "Saving…" : "Save changes") : pending ? "Booking…" : "Book shoot";
  return <SubmitButton disabled={pending || disabled}>{label}</SubmitButton>;
}
