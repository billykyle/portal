"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  dateIsBookable,
  formatMonthTitle,
  monthGrid,
  parseRequiredDateKey,
} from "@/lib/scheduling/horizon";
import { addCalendarMonths, calendarDateKey, parseDateKey } from "@/lib/scheduling/zoned-time";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function MonthCalendarDialog({
  open,
  onClose,
  selectedKey,
  firstBookableDate,
  lastBookableDate,
  datesWithSlots,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  selectedKey: string;
  firstBookableDate: string;
  lastBookableDate: string;
  datesWithSlots: Set<string>;
  onSelect: (dateKey: string) => void;
}) {
  const titleId = useId();
  const first = parseRequiredDateKey(firstBookableDate);
  const last = parseRequiredDateKey(lastBookableDate);
  const selected = parseDateKey(selectedKey) ?? first;
  const [cursor, setCursor] = useState({ year: selected.year, month: selected.month });

  useEffect(() => {
    if (!open) return;
    const next = parseDateKey(selectedKey) ?? first;
    setCursor({ year: next.year, month: next.month });
  }, [open, selectedKey, first.year, first.month]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const prevMonth = addCalendarMonths({ year: cursor.year, month: cursor.month, day: 1 }, -1);
  const nextMonth = addCalendarMonths({ year: cursor.year, month: cursor.month, day: 1 }, 1);
  const canPrev = cursor.year > first.year || (cursor.year === first.year && cursor.month > first.month);
  const canNext = cursor.year < last.year || (cursor.year === last.year && cursor.month < last.month);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[390px] rounded-2xl border border-white/10 bg-black p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canPrev}
            onClick={() => setCursor({ year: prevMonth.year, month: prevMonth.month })}
            className="flex size-10 items-center justify-center rounded-xl border border-white/10 disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h2 id={titleId} className="text-[16px] font-medium">
            {formatMonthTitle(cursor.year, cursor.month)}
          </h2>
          <button
            type="button"
            aria-label="Next month"
            disabled={!canNext}
            onClick={() => setCursor({ year: nextMonth.year, month: nextMonth.month })}
            className="flex size-10 items-center justify-center rounded-xl border border-white/10 disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-[0.14em] text-[#8e8e93]">
          {WEEKDAYS.map((day, index) => (
            <span key={`${day}-${index}`}>{day}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid(cursor.year, cursor.month).map((cell, index) => {
            if (!cell) {
              return <span key={`empty-${index}`} className="h-11" />;
            }
            const key = calendarDateKey(cell);
            const bookable = dateIsBookable(cell, first, last);
            const selectedDay = key === selectedKey;
            const hasSlots = datesWithSlots.has(key);
            const available = bookable && hasSlots;
            return (
              <button
                key={key}
                type="button"
                disabled={!available}
                aria-pressed={selectedDay}
                aria-label={
                  available
                    ? `${formatMonthTitle(cell.year, cell.month)} ${cell.day}`
                    : `${cell.day}, unavailable`
                }
                onClick={() => {
                  onSelect(key);
                  onClose();
                }}
                className={`flex h-11 flex-col items-center justify-center rounded-xl text-[15px] ${
                  !available
                    ? "cursor-not-allowed text-[#3a3a3c]"
                    : selectedDay
                      ? "bg-white text-black"
                      : "text-white hover:bg-white/5"
                }`}
              >
                <span>{cell.day}</span>
                <span
                  className={`mt-0.5 size-1 rounded-full ${
                    hasSlots ? (selectedDay ? "bg-black" : "bg-white") : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-[15px]"
        >
          <X className="size-4" aria-hidden />
          Close
        </button>
      </div>
    </div>
  );
}
