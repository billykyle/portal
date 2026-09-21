import { createHmac, timingSafeEqual } from "node:crypto";
import { publicPortalOrigin } from "@/lib/hosts";
import { formatBookingServices } from "./services";
import { schedulingConfirmedHref } from "./urls";

export const BOOKING_ICS_PATH = "/api/scheduling/ics";
export const ICS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const ICS_AFTER_END_MS = 14 * 24 * 60 * 60 * 1000;

export type BookingIcsInput = {
  bookingId: string;
  address: string;
  services: readonly string[];
  start: Date;
  end: Date;
  notes?: string | null;
  accessCodes?: string | null;
  updated?: boolean;
};

function icsSecret() {
  const value = process.env.JWT_SECRET?.trim() || process.env.BOOKING_ICS_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is not set.");
  }
  return "booking-ics-dev";
}

export function clientCalendarTitle(input: Pick<BookingIcsInput, "services">) {
  const services = formatBookingServices(input.services);
  return services ? `Billy Kyle · ${services}` : "Shoot with Billy Kyle";
}

export function clientCalendarDescription(input: BookingIcsInput) {
  const manageUrl = `${publicPortalOrigin()}${schedulingConfirmedHref(input.bookingId, input.updated ? { updated: true } : undefined)}`;
  const rows = [
    ["Services", formatBookingServices(input.services)],
    ["Where", input.address.trim()],
    ["Notes", input.notes?.trim() || ""],
    ["Access codes", input.accessCodes?.trim() || ""],
  ].filter(([, value]) => Boolean(value));
  return [...rows.map(([label, value]) => `${label}: ${value}`), "", `Modify or cancel: ${manageUrl}`].join("\n");
}

export function bookingIcsExpiry(endsAt: Date, now = new Date()) {
  return new Date(Math.max(endsAt.getTime() + ICS_AFTER_END_MS, now.getTime() + ICS_TOKEN_TTL_MS));
}

export function signBookingIcsToken(bookingId: string, endsAt: Date, now = new Date()) {
  const exp = Math.floor(bookingIcsExpiry(endsAt, now).getTime() / 1000);
  const payload = Buffer.from(JSON.stringify({ b: bookingId, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", icsSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readBookingIcsToken(token: string, now = new Date()): { bookingId: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", icsSecret()).update(payload).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { b?: unknown; exp?: unknown };
    if (typeof body.b !== "string" || !body.b || typeof body.exp !== "number") return null;
    if (body.exp * 1000 <= now.getTime()) return null;
    return { bookingId: body.b };
  } catch {
    return null;
  }
}

export function bookingIcsDownloadUrl(bookingId: string, endsAt: Date, now = new Date()) {
  return `${publicPortalOrigin()}${BOOKING_ICS_PATH}/${signBookingIcsToken(bookingId, endsAt, now)}`;
}

export function bookingIcsFilename(start: Date) {
  const stamp = start.toISOString().slice(0, 10);
  return `${stamp}-billy-kyle.ics`;
}

function icsEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\r\n", "\n").replaceAll("\n", "\\n");
}

function icsUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === start) end = Math.min(start + limit, bytes.length);
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = 74;
  }
  return [parts[0], ...parts.slice(1).map((part) => ` ${part}`)].join("\r\n");
}

export function buildBookingIcs(input: BookingIcsInput, now = new Date()) {
  const title = clientCalendarTitle(input);
  const description = clientCalendarDescription(input);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Billy Kyle//Portal//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${input.bookingId}@portal.billy-kyle.com`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsUtc(input.start)}`,
    `DTEND:${icsUtc(input.end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `LOCATION:${icsEscape(input.address.trim())}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `SEQUENCE:${input.updated ? 1 : 0}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function googleCalendarTemplateUrl(input: BookingIcsInput) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: clientCalendarTitle(input),
    dates: `${icsUtc(input.start)}/${icsUtc(input.end)}`,
    details: clientCalendarDescription(input),
    location: input.address.trim(),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function clientCalendarLinks(input: BookingIcsInput) {
  return {
    ics: buildBookingIcs(input),
    icsUrl: bookingIcsDownloadUrl(input.bookingId, input.end),
    googleUrl: googleCalendarTemplateUrl(input),
    filename: bookingIcsFilename(input.start),
    title: clientCalendarTitle(input),
  };
}
