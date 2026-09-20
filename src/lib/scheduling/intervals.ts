export type Interval = { start: Date; end: Date };

export function overlaps(a: Interval, b: Interval) {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function sameInterval(a: Interval, b: Interval) {
  return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime();
}

/** Remove `window` from busy blocks so a booking being edited does not block itself. */
export function subtractInterval<T extends Interval>(intervals: readonly T[], window: Interval): Interval[] {
  const out: Interval[] = [];
  for (const item of intervals) {
    if (!overlaps(item, window)) {
      out.push({ start: item.start, end: item.end });
      continue;
    }
    if (item.start.getTime() < window.start.getTime()) {
      out.push({ start: item.start, end: window.start });
    }
    if (item.end.getTime() > window.end.getTime()) {
      out.push({ start: window.end, end: item.end });
    }
  }
  return out.filter((item) => item.end.getTime() > item.start.getTime());
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((item) => item.end.getTime() > item.start.getTime())
    .map((item) => ({ start: new Date(item.start), end: new Date(item.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const out: Interval[] = [];
  for (const current of sorted) {
    const last = out[out.length - 1];
    if (!last || current.start.getTime() > last.end.getTime()) {
      out.push(current);
    } else if (current.end.getTime() > last.end.getTime()) {
      last.end = current.end;
    }
  }
  return out;
}
