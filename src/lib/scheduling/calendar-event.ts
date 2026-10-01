import { formatBookingServices, parseSchedulingServices, SCHEDULING_SERVICES } from "./services";

/** Catalog order. Industry words stay out of the title; duplicates collapse to one token. */
const CALENDAR_SERVICE_INITIALS: { token: string; services: readonly string[] }[] = [
  { token: "P", services: ["Real Estate · Photography", "Construction · Photography"] },
  { token: "V", services: ["Real Estate · Video", "Construction · Video"] },
  { token: "AP", services: ["Real Estate · Aerial Photos"] },
  { token: "360", services: ["Real Estate · Zillow 360"] },
  { token: "Podcast", services: ["Podcast · 1 episode", "Podcast · 2 episodes"] },
  { token: "CV", services: ["Commercial video"] },
];

export function calendarServiceInitials(services: readonly string[]) {
  const selected = new Set<string>(parseSchedulingServices(services));
  for (const service of services) {
    if ((SCHEDULING_SERVICES as readonly string[]).includes(service)) selected.add(service);
  }
  return CALENDAR_SERVICE_INITIALS.filter((item) => item.services.some((service) => selected.has(service)))
    .map((item) => item.token)
    .join(" ");
}

export const CALENDAR_EVENT_FOOTER = "Booked through your portal";

export type CalendarEventCopyInput = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address: string;
  services: readonly string[];
  notes?: string | null;
  accessCodes?: string | null;
};

/** First + last from the user profile; displayName only when those are missing. Never company. */
export function calendarClientName(input: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): string {
  const firstLast = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(" ");
  if (firstLast) return firstLast;
  return input.displayName?.trim() || "";
}

/** Title `(…)` is the notes value as typed. Empty/missing notes → no parens. */
export function calendarTitleLockbox(notes?: string | null): string | null {
  return notes?.trim() || null;
}

/** `{Name} - {initials}` or `{Name} - {initials} ({notes})`. Description keeps full service names. */
export function calendarEventTitle(input: CalendarEventCopyInput): string {
  const name = calendarClientName(input) || "Client";
  const services = calendarServiceInitials(input.services) || "Shoot";
  const lockbox = calendarTitleLockbox(input.notes);
  return lockbox ? `${name} - ${services} (${lockbox})` : `${name} - ${services}`;
}

/** Labeled client fields that exist, then exactly {@link CALENDAR_EVENT_FOOTER}. */
export function calendarEventDescription(input: CalendarEventCopyInput): string {
  const access = input.accessCodes?.trim() || "";
  const rows: Array<[string, string]> = [
    ["Name", calendarClientName(input)],
    ["Email", input.email?.trim() || ""],
    ["Phone", input.phone?.trim() || ""],
    ["Company", input.company?.trim() || ""],
    ["Address", input.address.trim()],
    ["Services", formatBookingServices(input.services)],
    ["Access codes", access],
    ["Notes", input.notes?.trim() || ""],
  ];
  const body = rows
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`);
  return [...body, "", CALENDAR_EVENT_FOOTER].join("\n");
}

export function calendarEventCopy(input: CalendarEventCopyInput): {
  summary: string;
  description: string;
} {
  return {
    summary: calendarEventTitle(input),
    description: calendarEventDescription(input),
  };
}
