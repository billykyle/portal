import { formatBookingServices, parseSchedulingServices, SCHEDULING_SERVICES } from "./services";

/** Catalog order. Industry words stay out of the title; duplicates collapse to one token. */
const CALENDAR_SERVICE_INITIALS: { token: string; services: readonly string[] }[] = [
  { token: "P", services: ["Real Estate · Photography", "Construction · Photography"] },
  { token: "V", services: ["Real Estate · Video", "Construction · Video"] },
  {
    token: "V.",
    services: ["Social Media Video · Monthly Batch Video", "Social Media Video · Long Form Content Creation"],
  },
  { token: "AP", services: ["Real Estate · Aerial Photos"] },
  { token: "Twi", services: ["Real Estate · Twilight"] },
  { token: "360", services: ["Real Estate · Zillow 360"] },
  { token: "Ext", services: ["Real Estate · Exterior Only"] },
  { token: "Podcast", services: ["Podcast · 1 episode", "Podcast · 2 episodes"] },
  { token: "CV", services: ["Commercial video"] },
  { token: "M", services: ["Meeting · 30 min appointment", "Meeting · 1 hour appointment"] },
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

/**
 * Title `(…)` is only a lockbox: a short access code typed in notes.
 * Sentences and other notes stay in the description. Empty notes → no parens.
 */
export function calendarTitleLockbox(notes?: string | null): string | null {
  const text = notes?.trim() ?? "";
  if (!text || !isLockboxCode(text)) return null;
  return text;
}

/** A short code, not a sentence. "1234" and "gate code 1234" count. "I will meet you there" does not. */
function isLockboxCode(text: string): boolean {
  if (text.includes("@")) return false;
  const core = text.replace(/[.!?]+$/, "");
  if (!core || /[.!?]/.test(core)) return false;
  if (!/\d/.test(core)) return false;
  if (core.length > 40) return false;
  const words = core.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  if (words.length >= 4 && !/^(lock\s*box|lockbox|gate|code|access|lb|combo|combination)\b/i.test(core)) {
    return false;
  }
  return true;
}

/** `{Name} - {initials}`, plus `({lockbox})` only for a short access code in notes. */
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
