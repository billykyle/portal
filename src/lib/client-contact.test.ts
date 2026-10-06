import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  NAS_IMPORT_INVITE_NOTE,
  backfillPlaceholderClient,
  deliverableClientEmails,
  inviteRedeemClientUpdate,
  prepareDeliverableBookingEmail,
  primaryBookingContact,
  shootNotificationRecipients,
  skippedPlaceholderDeliveryWarning,
  stripNasInviteNote,
} from "./client-contact";

const placeholder = "justin.heath@pending.local";
const login = "justin@sellinggreaterphilly.com";
const signedUp = new Date("2026-09-24T11:26:31Z");

test("invite redemption replaces a placeholder primary email and clears the NAS note", () => {
  const patch = inviteRedeemClientUpdate(
    { primaryEmail: placeholder, notes: NAS_IMPORT_INVITE_NOTE },
    "Justin@SellingGreaterPhilly.com",
  );
  assert.deepEqual(patch, { primaryEmail: login, notes: null });
});

test("invite redemption keeps a real primary email and still clears the invite note", () => {
  const patch = inviteRedeemClientUpdate(
    {
      primaryEmail: "sam@example.com",
      notes: `${NAS_IMPORT_INVITE_NOTE}\nPrefers morning shoots.`,
    },
    login,
  );
  assert.deepEqual(patch, {
    primaryEmail: "sam@example.com",
    notes: "Prefers morning shoots.",
  });
});

test("invite redemption does not replace a placeholder with another placeholder", () => {
  const patch = inviteRedeemClientUpdate(
    { primaryEmail: placeholder, notes: NAS_IMPORT_INVITE_NOTE },
    "other@pending.local",
  );
  assert.deepEqual(patch, { primaryEmail: placeholder, notes: null });
});

test("invite redemption is a no-op once the contact is already real and the note is gone", () => {
  assert.equal(
    inviteRedeemClientUpdate({ primaryEmail: login, notes: "Call the office." }, login),
    null,
  );
  assert.equal(stripNasInviteNote("Call the office."), "Call the office.");
  assert.equal(stripNasInviteNote(null), null);
});

test("backfill uses the earliest real login and is idempotent", () => {
  const client = { primaryEmail: placeholder, notes: NAS_IMPORT_INVITE_NOTE };
  const logins = [
    { email: "later@example.com", createdAt: new Date("2026-09-25T00:00:00Z") },
    { email: "also@pending.local", createdAt: new Date("2026-09-24T11:00:00Z") },
    { email: login, createdAt: signedUp },
  ];
  const once = backfillPlaceholderClient(client, logins);
  assert.deepEqual(once, { primaryEmail: login, notes: null });
  assert.equal(backfillPlaceholderClient({ ...client, ...once! }, logins), null);
});

test("backfill leaves a placeholder alone when there is no real login", () => {
  const client = { primaryEmail: placeholder, notes: NAS_IMPORT_INVITE_NOTE };
  assert.equal(
    backfillPlaceholderClient(client, [
      { email: "nobody@pending.local", createdAt: signedUp },
    ]),
    null,
  );
  assert.equal(backfillPlaceholderClient(client, []), null);
  assert.equal(
    backfillPlaceholderClient({ primaryEmail: login, notes: NAS_IMPORT_INVITE_NOTE }, [
      { email: "other@example.com", createdAt: signedUp },
    ]),
    null,
  );
});

test("client mail prefers a real login and never returns a placeholder", () => {
  assert.deepEqual(
    deliverableClientEmails({
      preferred: login,
      primaryEmail: placeholder,
      loginEmails: ["other@example.com"],
    }),
    [login],
  );
  assert.deepEqual(
    deliverableClientEmails({
      preferred: placeholder,
      primaryEmail: placeholder,
      loginEmails: [placeholder, "teammate@example.com", login],
    }),
    ["teammate@example.com", login],
  );
  assert.deepEqual(
    deliverableClientEmails({
      preferred: placeholder,
      primaryEmail: "office@example.com",
      loginEmails: [placeholder],
    }),
    ["office@example.com"],
  );
  assert.deepEqual(
    deliverableClientEmails({ preferred: placeholder, primaryEmail: placeholder, loginEmails: [] }),
    [],
  );
});

test("shoot recipients are every login, the real primary, and notes, once", () => {
  assert.deepEqual(
    shootNotificationRecipients({
      clientEmail: "Nana.Shames@compass.com",
      primaryEmail: "office@compass.com",
      loginEmails: [
        "nana.shames@compass.com",
        "guest@pending.local",
        "assistant@compass.com",
      ],
      notes: "cc Office@compass.com and alex@agency.com and billy@billyhere.com",
      notifyEmail: "billy@billyhere.com",
    }),
    ["nana.shames@compass.com", "assistant@compass.com", "office@compass.com", "alex@agency.com"],
  );
  assert.deepEqual(
    shootNotificationRecipients({
      clientEmail: "justin.heath@pending.local",
      primaryEmail: "justin.heath@pending.local",
      loginEmails: [],
      notes: "cc justin.heath@pending.local",
      notifyEmail: "billy@billyhere.com",
    }),
    [],
  );
  assert.deepEqual(
    shootNotificationRecipients({
      clientEmail: "Billy@BillyHere.com",
      primaryEmail: "office@example.com",
      loginEmails: ["billy@billyhere.com"],
      notifyEmail: "billy@billyhere.com",
    }),
    ["billy@billyhere.com", "office@example.com"],
  );
});

test("admin booking contact is the primary login, not the newest user", () => {
  type ContactLogin = { email: string; createdAt: Date; userId?: string };
  const oldest: ContactLogin = {
    email: "assistant@compass.com",
    createdAt: new Date("2020-01-01T00:00:00.000Z"),
  };
  const colleen: ContactLogin = {
    email: "colleen.hadden@compass.com",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    userId: "colleen",
  };
  const nana: ContactLogin = {
    email: "nana.shames@compass.com",
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    userId: "nana",
  };
  const matched = primaryBookingContact({
    primaryEmail: "Colleen.Hadden@compass.com",
    logins: [nana, oldest, colleen],
  });
  assert.equal(matched?.email, "colleen.hadden@compass.com");
  assert.equal(matched?.login?.userId, "colleen");

  const office = primaryBookingContact({
    primaryEmail: "office@compass.com",
    logins: [nana, colleen],
  });
  assert.equal(office?.email, "office@compass.com");
  assert.equal(office?.login, null);

  const placeholder = primaryBookingContact({
    primaryEmail: "colleen.hadden@pending.local",
    logins: [nana, { email: "guest@pending.local", createdAt: new Date("2019-01-01T00:00:00.000Z") }, colleen],
  });
  assert.equal(placeholder?.email, "colleen.hadden@compass.com");
  assert.equal(placeholder?.login, colleen);

  assert.equal(
    primaryBookingContact({
      primaryEmail: "guest@pending.local",
      logins: [{ email: "guest@pending.local", createdAt: signedUp }],
    }),
    null,
  );
});

test("booking send list includes teammates even when the booker address is real", () => {
  const prepared = prepareDeliverableBookingEmail(
    {
      clientEmail: login,
      primaryEmail: "office@example.com",
      loginEmails: [login, "teammate@example.com"],
      notes: "cc extra@example.com",
    },
    { loginEmails: ["Teammate@Example.com"] },
  );
  assert.deepEqual(prepared.recipients, [login, "teammate@example.com", "office@example.com", "extra@example.com"]);
  assert.equal(prepared.send.clientEmail, "office@example.com");
});

test("booking send list falls back to logins and the alert keeps the refused placeholder", () => {
  const prepared = prepareDeliverableBookingEmail(
    {
      clientEmail: placeholder,
      primaryEmail: placeholder,
      loginEmails: [login],
    },
    { loginEmails: ["teammate@example.com"] },
  );
  assert.deepEqual(prepared.recipients, [login, "teammate@example.com"]);
  assert.deepEqual(prepared.send.clientRecipients, [login, "teammate@example.com"]);
  assert.equal(prepared.alert.clientEmail, `${login}, teammate@example.com`);

  const skipped = prepareDeliverableBookingEmail({
    clientEmail: "",
    primaryEmail: placeholder,
  });
  assert.deepEqual(skipped.recipients, []);
  assert.deepEqual(skipped.send.clientRecipients, []);
  assert.equal(skipped.alert.clientEmail, placeholder);
});

test("placeholder backfill loads logins once and does not re-enter ensureDb", () => {
  const source = readFileSync("src/lib/client-contact.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function backfillPlaceholderPrimaryEmails"));
  const body = fn.slice(0, fn.indexOf("export async function lookupClientLoginEmails"));
  assert.match(body, /inArray\(users\.clientId, ids\)/);
  assert.match(body, /inArray\(userClients\.clientId, ids\)/);
  assert.match(body, /backfillPlaceholderClient\(/);
  assert.doesNotMatch(body, /listMemberUsers\(/);
  assert.doesNotMatch(body, /ensureDb\(/);

  const ensure = readFileSync("src/lib/db/ensure.ts", "utf8");
  const ensureFn = ensure.slice(ensure.indexOf("export async function ensureDb"));
  assert.match(ensureFn, /if \(migration\.getStore\(\)\) return/);
  assert.match(ensureFn, /migration\.run\(true/);
});

test("delivery skip warning names the placeholder and is distinct from a folder skip", () => {
  const warning = skippedPlaceholderDeliveryWarning({
    displayName: "Justin Heath",
    inviteCode: "BK00004",
    primaryEmail: placeholder,
    where: "Justin Heath/2026.10.02 - 210 McClure Drive",
  });
  assert.match(warning, /no real email/);
  assert.match(warning, /justin\.heath@pending\.local/);
  assert.match(warning, /BK00004/);
  assert.doesNotMatch(warning, /skipped folder/i);
});
