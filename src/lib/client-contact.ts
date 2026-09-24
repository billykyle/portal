import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, clients, users } from "@/lib/db/schema";
import {
  CLIENT_EMAIL_SKIPPED_PLACEHOLDER,
  bookingNotifyEmail,
  normalizeEmail,
  sendEmail,
  uniqueEmails,
} from "@/lib/email";
import { BOOKING_SYNC_ISSUE_SUBJECT } from "@/lib/scheduling/booking-sync";
import { isPendingClientEmail } from "@/lib/signup-fields";

/** Note stored on clients created by Sync from NAS, before anyone signs up. */
export const NAS_IMPORT_INVITE_NOTE =
  "Imported from the NAS share. Give the client this invite code so they can sign up.";

export function stripNasInviteNote(notes: string | null | undefined): string | null {
  if (!notes) return null;
  if (!notes.includes(NAS_IMPORT_INVITE_NOTE)) return notes;
  const next = notes
    .split(NAS_IMPORT_INVITE_NOTE)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return next || null;
}

/**
 * Invite redemption: replace a NAS placeholder primary email with the new
 * login, and drop the "give them this invite code" note. A real primary
 * email is left as-is.
 */
export function inviteRedeemClientUpdate(
  client: { primaryEmail: string; notes: string | null },
  signupEmail: string,
): { primaryEmail: string; notes: string | null } | null {
  const email = signupEmail.trim().toLowerCase();
  const nextEmail =
    isPendingClientEmail(client.primaryEmail) && email && !isPendingClientEmail(email)
      ? email
      : client.primaryEmail;
  const nextNotes = stripNasInviteNote(client.notes);
  const notesChanged = nextNotes !== (client.notes ?? null);
  if (nextEmail === client.primaryEmail && !notesChanged) return null;
  return { primaryEmail: nextEmail, notes: nextNotes };
}

/** Idempotent: no-op once primaryEmail is a real address, or when nobody has a real login. */
export function backfillPlaceholderClient(
  client: { primaryEmail: string; notes: string | null },
  logins: Array<{ email: string; createdAt: Date }>,
): { primaryEmail: string; notes: string | null } | null {
  if (!isPendingClientEmail(client.primaryEmail)) return null;
  const real = logins
    .filter((row) => row.email && !isPendingClientEmail(row.email))
    .slice()
    .sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.email.localeCompare(b.email),
    );
  const first = real[0];
  if (!first) return null;
  return inviteRedeemClientUpdate(client, first.email);
}

/**
 * Who may receive a client-facing email.
 * A real preferred address (the booker's login) wins.
 * A placeholder falls through to real login emails, then a real primary email.
 * Placeholder addresses are never returned.
 */
export function deliverableClientEmails(input: {
  preferred?: string | null;
  primaryEmail?: string | null;
  loginEmails?: readonly (string | null | undefined)[] | null;
}): string[] {
  const preferred = normalizeEmail(input.preferred);
  if (preferred && !isPendingClientEmail(preferred)) return [preferred];
  const logins = uniqueEmails([...(input.loginEmails ?? [])]).filter((email) => !isPendingClientEmail(email));
  if (logins.length > 0) return logins;
  const primary = normalizeEmail(input.primaryEmail);
  if (primary && !isPendingClientEmail(primary)) return [primary];
  return [];
}

export function skippedPlaceholderDeliveryWarning(input: {
  displayName: string;
  inviteCode: string;
  primaryEmail: string;
  where: string;
}) {
  return `Skipped delivery notice for ${input.where}: ${input.displayName} (${input.inviteCode}) has no real email. Placeholder ${input.primaryEmail} was not used.`;
}

export function reportSkippedPlaceholder(detail: Record<string, unknown>) {
  console.error(CLIENT_EMAIL_SKIPPED_PLACEHOLDER, JSON.stringify(detail));
}

export async function alertUndeliverableClientEmail(message: string) {
  reportSkippedPlaceholder({ message });
  const alert = await sendEmail({
    to: bookingNotifyEmail(),
    subject: BOOKING_SYNC_ISSUE_SUBJECT,
    text: message,
  });
  if (!alert.sent) {
    reportSkippedPlaceholder({ message, alert: alert.reason });
  }
  return alert;
}

export async function recordInviteRedeemedContact(
  client: { id: string; company: string | null; primaryEmail: string; notes: string | null },
  input: { email: string; companyName?: string | null },
) {
  const patch = inviteRedeemClientUpdate(client, input.email);
  const companyName = String(input.companyName ?? "").trim();
  const setCompany = !client.company && Boolean(companyName);
  if (!patch && !setCompany) return;
  await db
    .update(clients)
    .set({
      ...(patch ? { primaryEmail: patch.primaryEmail, notes: patch.notes } : {}),
      ...(setCompany ? { company: companyName } : {}),
    })
    .where(eq(clients.id, client.id));
}

export async function backfillPlaceholderPrimaryEmails() {
  const pending = await db
    .select()
    .from(clients)
    .where(ilike(clients.primaryEmail, "%@pending.local"));
  let updated = 0;
  for (const client of pending) {
    const logins = await db
      .select({ email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.clientId, client.id))
      .orderBy(asc(users.createdAt));
    const patch = backfillPlaceholderClient(client, logins);
    if (!patch) continue;
    const saved = await db
      .update(clients)
      .set({ primaryEmail: patch.primaryEmail, notes: patch.notes })
      .where(and(eq(clients.id, client.id), ilike(clients.primaryEmail, "%@pending.local")))
      .returning({ id: clients.id });
    if (saved.length > 0) updated += 1;
  }
  if (updated > 0) {
    console.log(`Backfilled placeholder primary email on ${updated} client(s).`);
  }
  return { updated };
}

export async function lookupClientLoginEmails(bookingId: string) {
  const [booking] = await db
    .select({ clientId: bookings.clientId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) return { primaryEmail: null as string | null, loginEmails: [] as string[] };
  const [client] = await db
    .select({ primaryEmail: clients.primaryEmail })
    .from(clients)
    .where(eq(clients.id, booking.clientId))
    .limit(1);
  const members = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.clientId, booking.clientId))
    .orderBy(asc(users.createdAt));
  return {
    primaryEmail: client?.primaryEmail ?? null,
    loginEmails: members.map((row) => row.email),
  };
}

type BookingEmailShape = {
  clientEmail: string;
  primaryEmail?: string | null;
  loginEmails?: readonly (string | null | undefined)[] | null;
  clientRecipients?: string[];
};

/** Resolve who the booking mail may go to. `alert` keeps the refused placeholder when nobody is real. */
export function prepareDeliverableBookingEmail<T extends BookingEmailShape>(
  email: T,
  lookedUp?: { primaryEmail?: string | null; loginEmails?: readonly string[] | null },
): { recipients: string[]; send: T & { clientRecipients: string[] }; alert: T } {
  const enriched: T = {
    ...email,
    primaryEmail: email.primaryEmail ?? lookedUp?.primaryEmail ?? null,
    loginEmails: [...(email.loginEmails ?? []), ...(lookedUp?.loginEmails ?? [])],
  };
  const recipients = deliverableClientEmails({
    preferred: enriched.clientEmail,
    primaryEmail: enriched.primaryEmail,
    loginEmails: enriched.loginEmails,
  });
  const blocked =
    [enriched.clientEmail, enriched.primaryEmail].find((value) => isPendingClientEmail(String(value ?? ""))) ??
    enriched.clientEmail;
  return {
    recipients,
    send: {
      ...enriched,
      clientRecipients: recipients,
      clientEmail: recipients[0] ?? enriched.clientEmail,
    },
    alert: {
      ...enriched,
      clientEmail: recipients.length > 0 ? recipients.join(", ") : String(blocked ?? ""),
    },
  };
}

export async function prepareDeliverableBookingEmailForBooking<T extends BookingEmailShape>(
  bookingId: string,
  email: T,
) {
  const first = prepareDeliverableBookingEmail(email);
  if (first.recipients.length > 0) return first;
  const lookedUp = await lookupClientLoginEmails(bookingId);
  return prepareDeliverableBookingEmail(email, lookedUp);
}
