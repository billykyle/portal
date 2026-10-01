import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { emailConfigured, sendEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { bookings, clients, users } from "@/lib/db/schema";
import { schedulingHours } from "@/lib/scheduling/config";
import { bookingServiceList } from "@/lib/scheduling/services";
import {
  buildShootReminder,
  reminderDecision,
  reminderRecipients,
  type ReminderDecision,
} from "@/lib/scheduling/shoot-reminder";
import type { BookingEmailThread } from "@/lib/scheduling/booking-email";

/** Same-day 6am reminders are for shoots that have not started yet today. */
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
const SEND_GAP_MS = 200;

export type ReminderCandidate = {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  reminderSentAt: Date | null;
  address: string;
  services: string[];
  notes: string | null;
  clientEmail: string | null;
  primaryEmail: string | null;
  loginEmails: string[];
  thread: BookingEmailThread | null;
};

export type ReminderRunCounts = {
  checked: number;
  sent: number;
  skipped: number;
  failed: number;
};

export type ReminderSend = (input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}) => Promise<{ sent: boolean }>;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Claim, send, and release. A booking counts as sent when any recipient
 * accepts the message. A total failure clears the claim so the next hour retries.
 */
export async function deliverDueReminders(
  candidates: ReminderCandidate[],
  options: {
    now: Date;
    timeZone: string;
    claim: (id: string) => Promise<boolean>;
    release: (id: string) => Promise<void>;
    send: ReminderSend;
    gapMs?: number;
  },
): Promise<ReminderRunCounts> {
  const counts: ReminderRunCounts = { checked: candidates.length, sent: 0, skipped: 0, failed: 0 };
  const gapMs = options.gapMs ?? 0;
  let paused = false;

  for (const booking of candidates) {
    const decision: ReminderDecision = reminderDecision(booking, options.now);
    if (decision !== "send") {
      counts.skipped += 1;
      continue;
    }
    const recipients = reminderRecipients({
      clientEmail: booking.clientEmail,
      primaryEmail: booking.primaryEmail,
      loginEmails: booking.loginEmails,
      notes: booking.notes,
    });
    if (recipients.length === 0) {
      counts.skipped += 1;
      continue;
    }
    const claimed = await options.claim(booking.id);
    if (!claimed) {
      counts.skipped += 1;
      continue;
    }
    const message = buildShootReminder({
      bookingId: booking.id,
      address: booking.address,
      services: booking.services,
      start: booking.startsAt,
      end: booking.endsAt,
      timeZone: options.timeZone,
      notes: booking.notes,
      thread: booking.thread,
    });
    let sentAny = false;
    for (const to of recipients) {
      if (paused && gapMs > 0) await sleep(gapMs);
      paused = true;
      const result = await options.send({
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: message.headers,
      });
      if (result.sent) sentAny = true;
    }
    if (sentAny) {
      counts.sent += 1;
    } else {
      await options.release(booking.id);
      counts.failed += 1;
    }
  }

  return counts;
}

async function loadReminderCandidates(now: Date): Promise<ReminderCandidate[]> {
  const horizon = new Date(now.getTime() + LOOKAHEAD_MS);
  const rows = await db
    .select({
      booking: bookings,
      primaryEmail: clients.primaryEmail,
      creatorEmail: users.email,
    })
    .from(bookings)
    .innerJoin(clients, eq(bookings.clientId, clients.id))
    .leftJoin(users, eq(bookings.createdByUserId, users.id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        isNull(bookings.reminderSentAt),
        gt(bookings.startsAt, now),
        lte(bookings.startsAt, horizon),
      ),
    );

  const clientIds = [...new Set(rows.map((row) => row.booking.clientId))];
  const logins =
    clientIds.length === 0
      ? []
      : await db
          .select({ clientId: users.clientId, email: users.email })
          .from(users)
          .where(inArray(users.clientId, clientIds));
  const loginsByClient = new Map<string, string[]>();
  for (const login of logins) {
    const list = loginsByClient.get(login.clientId) ?? [];
    list.push(login.email);
    loginsByClient.set(login.clientId, list);
  }

  return rows.flatMap((row) => {
    if (!row.booking.startsAt || !row.booking.endsAt) return [];
    return [{
    id: row.booking.id,
    status: row.booking.status,
    startsAt: row.booking.startsAt,
    endsAt: row.booking.endsAt,
    createdAt: row.booking.createdAt,
    reminderSentAt: row.booking.reminderSentAt,
    address: row.booking.address,
    services: bookingServiceList(row.booking),
    notes: row.booking.notes,
    clientEmail: row.creatorEmail,
    primaryEmail: row.primaryEmail,
    loginEmails: loginsByClient.get(row.booking.clientId) ?? [],
    thread: row.booking.clientEmailMessageId
      ? {
          inReplyTo: row.booking.clientEmailMessageId,
          references: row.booking.clientEmailReferences,
          originalSubject: row.booking.clientEmailSubject,
        }
      : null,
    }];
  });
}

async function claimReminder(id: string, now: Date) {
  const [row] = await db
    .update(bookings)
    .set({ reminderSentAt: now })
    .where(and(eq(bookings.id, id), isNull(bookings.reminderSentAt)))
    .returning({ id: bookings.id });
  return Boolean(row);
}

async function releaseReminder(id: string) {
  await db.update(bookings).set({ reminderSentAt: null }).where(eq(bookings.id, id));
}

export async function sendDueShootReminders(now = new Date()): Promise<ReminderRunCounts & { reason?: string }> {
  if (!emailConfigured()) {
    return { checked: 0, sent: 0, skipped: 0, failed: 0, reason: "resend-unconfigured" };
  }
  await ensureDb();
  const candidates = await loadReminderCandidates(now);
  return deliverDueReminders(candidates, {
    now,
    timeZone: schedulingHours().timeZone,
    claim: (id) => claimReminder(id, now),
    release: releaseReminder,
    send: (message) => sendEmail(message),
    gapMs: SEND_GAP_MS,
  });
}
