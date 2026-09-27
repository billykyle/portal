import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMaintenanceEmail,
  formatEtDateTimeLocal,
  maintenanceIsLive,
  maintenanceRecipients,
  parseEtDateTimeLocal,
} from "./maintenance";

test("a notice is live only inside its window", () => {
  const notice = {
    message: "Portal updates",
    startsAt: new Date("2026-09-28T13:00:00.000Z"),
    endsAt: new Date("2026-09-28T17:00:00.000Z"),
  };
  assert.equal(maintenanceIsLive(notice, new Date("2026-09-28T12:59:00.000Z")), false);
  assert.equal(maintenanceIsLive(notice, notice.startsAt), true);
  assert.equal(maintenanceIsLive(notice, notice.endsAt), true);
  assert.equal(maintenanceIsLive(notice, new Date("2026-09-28T17:00:01.000Z")), false);
  assert.equal(maintenanceIsLive(null, notice.startsAt), false);
});

test("maintenance form times are Eastern wall times", () => {
  const parsed = parseEtDateTimeLocal("2026-09-28T09:00");
  assert.equal(parsed?.toISOString(), "2026-09-28T13:00:00.000Z");
  assert.equal(parsed ? formatEtDateTimeLocal(parsed) : "", "2026-09-28T09:00");
  assert.equal(parseEtDateTimeLocal("tomorrow"), null);
});

test("maintenance mail skips placeholders and duplicate primary emails", () => {
  assert.deepEqual(
    maintenanceRecipients([
      "Sam@example.com",
      "sam@example.com",
      "firm@pending.local",
      "  ",
      "alex@example.com",
    ]),
    ["sam@example.com", "alex@example.com"],
  );
});

test("maintenance email names the window and the message", () => {
  const message = buildMaintenanceEmail({
    message: "The portal will be briefly unavailable.",
    startsAt: new Date("2026-09-28T13:00:00.000Z"),
    endsAt: new Date("2026-09-28T15:00:00.000Z"),
  });
  assert.match(message.subject, /^Scheduled maintenance — /);
  assert.match(message.subject, /ET$/);
  assert.match(message.text, /briefly unavailable/);
  assert.match(message.html, /Scheduled maintenance/);
  assert.match(message.html, /billy-kyle.com/);
});
