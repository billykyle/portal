export type Interval = { start: Date; end: Date };

export function overlaps(a: Interval, b: Interval) {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
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
