"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SubmitButton } from "@/components/field";
import { MonthCalendarDialog } from "@/components/forms/month-calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createBooking } from "@/lib/actions/scheduling";
import type { AvailabilityResult, OfferedSlot } from "@/lib/scheduling/availability";
import {
  formatDateKeyLabel,
  formatWeekDayListLabel,
  parseRequiredDateKey,
  weekDateKeys,
} from "@/lib/scheduling/horizon";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export function BookTimesForm({
  availability,
  services,
  notes = "",
}: {
  availability: AvailabilityResult;
  services: string[];
  notes?: string;
}) {
  const slotsByDate = useMemo(() => groupSlotsByDate(availability.slots), [availability.slots]);
  const datesWithSlots = useMemo(() => new Set(slotsByDate.keys()), [slotsByDate]);
  const last = parseRequiredDateKey(availability.lastBookableDate);
  const firstKey = availability.firstBookableDate;
  const [weekStart, setWeekStart] = useState(firstKey);
  const [openDates, setOpenDates] = useState<string[]>(() =>
    firstOpenDate(weekDateKeys(parseRequiredDateKey(firstKey), last), datesWithSlots),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotError, setSlotError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const weekKeys = weekDateKeys(parseRequiredDateKey(weekStart), last);
  const changeHref = schedulingBookHref({
    address: availability.address,
    services,
    notes: notes || null,
  });

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    function onSubmit(event: Event) {
      if (!selectedSlot) {
        event.preventDefault();
        setSlotError("Pick a time.");
      }
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [selectedSlot]);

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
      <p className="text-sm text-[#8e8e93]">Step 2 of 2 — available times</p>
      <div className="mt-3">
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
      </div>

      <h2 className="mt-8 mb-4 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Available times</h2>
      {availability.notices.map((notice) => (
        <p key={notice} className="mb-4 text-sm leading-6 text-[#c7c7cc]">
          {notice}
        </p>
      ))}
      {availability.slots.length === 0 ? (
        <p className="mb-4 text-sm text-[#8e8e93]">No times fit this address right now.</p>
      ) : null}

      <form ref={formRef} action={createBooking} className="flex flex-col gap-6">
        <input type="hidden" name="address" value={availability.address} />
        {services.map((service) => (
          <input key={service} type="hidden" name="service" value={service} />
        ))}
        <input type="hidden" name="notes" value={notes} />
        <input type="hidden" name="slot" value={selectedSlot} />
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
                      <CollapsibleContent>
                        <div className="px-3 pb-3">
                          <ul className="grid gap-2 sm:grid-cols-2">
                            {slots.map((slot) => {
                              const value = `${slot.start}|${slot.end}`;
                              const checked = selectedSlot === value;
                              return (
                                <li key={slot.start}>
                                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 has-[:checked]:border-white has-[:checked]:bg-white/5">
                                    <input
                                      type="radio"
                                      checked={checked}
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
          Further Date Options
        </button>
        {slotError ? <p className="text-sm text-[#a1a1a1]">{slotError}</p> : null}
        <SubmitButton>Book shoot</SubmitButton>
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

function firstOpenDate(weekKeys: string[], datesWithSlots: Set<string>) {
  const first = weekKeys.find((key) => datesWithSlots.has(key));
  return first ? [first] : [];
}
