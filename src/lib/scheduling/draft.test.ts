import assert from "node:assert/strict";
import { test } from "node:test";
import { ADMIN_BOOKINGS, CLIENT_SCHEDULING, CLIENT_SCHEDULING_TIMES } from "../routes";
import {
  draftAdoptPath,
  draftInputFromForm,
  draftMatchesModify,
  isLegacySchedulingQuery,
  normalizeDraftInput,
  schedulingFlowFields,
  schedulingStepPath,
  type SchedulingDraft,
} from "./draft";

const bookingId = "11111111-1111-4111-8111-111111111111";

function draft(overrides: Partial<SchedulingDraft> = {}): SchedulingDraft {
  return {
    id: "abcdefghij123456",
    scope: "client",
    address: "12 Wood View Drive, Princeton, NJ",
    placeId: "ChIJ123",
    services: ["Real Estate · Photography"],
    notes: "Lockbox on the porch",
    modifyBookingId: null,
    updatedAt: new Date("2026-09-21T12:00:00.000Z"),
    ...overrides,
  };
}

test("legacy scheduling queries are the ones that carry the form", () => {
  assert.equal(isLegacySchedulingQuery({}), false);
  assert.equal(isLegacySchedulingQuery({ modify: bookingId, error: "Pick a time.", cancelled: "1" }), false);
  assert.equal(isLegacySchedulingQuery({ address: "12 Wood View Drive" }), true);
  assert.equal(isLegacySchedulingQuery({ notes: "Lockbox" }), true);
  assert.equal(isLegacySchedulingQuery({ placeId: "ChIJ123" }), true);
  assert.equal(isLegacySchedulingQuery({ service: ["Real Estate · Photography"] }), true);
  assert.equal(isLegacySchedulingQuery({ address: "   ", service: "" }), false);
});

test("draft input drops unknown services and keeps notes multiline", () => {
  const input = normalizeDraftInput({
    address: "  12   Wood View Drive  ",
    placeId: " ChIJ123 ",
    services: ["Real Estate · Photography", "Not a service", "Construction · Video"],
    notes: "  Gate code\n4455  ",
    modifyBookingId: `  ${bookingId}  `,
  });
  assert.deepEqual(input, {
    address: "12 Wood View Drive",
    placeId: "ChIJ123",
    services: ["Real Estate · Photography", "Construction · Video"],
    notes: "Gate code\n4455",
    modifyBookingId: bookingId,
  });
});

test("form data becomes a draft without a query string", () => {
  const form = new FormData();
  form.set("address", "12 Wood View Drive, Princeton, NJ");
  form.set("placeId", "ChIJ123");
  form.append("service", "Real Estate · Photography");
  form.append("service", "Construction · Video");
  form.set("notes", "Lockbox on the porch");
  form.set("modify", bookingId);
  assert.deepEqual(draftInputFromForm(form), {
    address: "12 Wood View Drive, Princeton, NJ",
    placeId: "ChIJ123",
    services: ["Real Estate · Photography", "Construction · Video"],
    notes: "Lockbox on the porch",
    modifyBookingId: bookingId,
  });
});

test("flow fields prefer a matching draft and fall back to the booking", () => {
  const saved = {
    address: "3900 City Ave, Philadelphia, PA",
    services: ["Construction · Photography"],
    notes: "Original",
    updatedAt: new Date("2026-09-20T12:00:00.000Z"),
  };
  assert.deepEqual(schedulingFlowFields(draft(), "", null), {
    address: "12 Wood View Drive, Princeton, NJ",
    placeId: "ChIJ123",
    services: ["Real Estate · Photography"],
    notes: "Lockbox on the porch",
  });
  assert.deepEqual(schedulingFlowFields(draft({ modifyBookingId: bookingId }), bookingId, saved), {
    address: "12 Wood View Drive, Princeton, NJ",
    placeId: "ChIJ123",
    services: ["Real Estate · Photography"],
    notes: "Lockbox on the porch",
  });
  assert.deepEqual(schedulingFlowFields(draft(), bookingId, saved).address, saved.address);
  assert.deepEqual(schedulingFlowFields(null, bookingId, saved).services, ["Construction · Photography"]);
  assert.deepEqual(schedulingFlowFields(null, "", null).address, "");
  assert.equal(draftMatchesModify(draft({ modifyBookingId: bookingId }), bookingId), true);
  assert.equal(draftMatchesModify(draft(), bookingId), false);
});

test("a booking saved after the draft replaces the in-progress copy", () => {
  const fields = schedulingFlowFields(draft({ modifyBookingId: bookingId }), bookingId, {
    address: "3900 City Ave, Philadelphia, PA",
    services: ["Construction · Photography"],
    notes: "Saved",
    updatedAt: new Date("2026-09-21T15:00:00.000Z"),
  });
  assert.equal(fields.address, "3900 City Ave, Philadelphia, PA");
  assert.deepEqual(fields.services, ["Construction · Photography"]);
});

test("clean step paths and the adopt hop omit the street address", () => {
  const address = "12 Wood View Drive, Princeton, NJ, USA";
  assert.equal(schedulingStepPath({ scope: "client", to: "times" }), CLIENT_SCHEDULING_TIMES);
  assert.equal(
    schedulingStepPath({ scope: "client", to: "book", modifyBookingId: bookingId, error: "Enter the shoot address first." }),
    `${CLIENT_SCHEDULING}?error=Enter+the+shoot+address+first.&modify=${bookingId}`,
  );
  assert.equal(
    schedulingStepPath({ scope: "admin", to: "times", bookingId }),
    `${ADMIN_BOOKINGS}/${bookingId}/times`,
  );
  const adopt = draftAdoptPath({
    id: "abcdefghij123456",
    to: "times",
    error: "Pick a time.",
  });
  assert.equal(adopt, "/api/scheduling/draft/adopt?d=abcdefghij123456&to=times&error=Pick+a+time.");
  assert.doesNotMatch(adopt, /[?&](address|service|notes|placeId)=/);
  assert.doesNotMatch(adopt, new RegExp(address.split(",")[0]));
  const clipped = schedulingStepPath({
    scope: "client",
    to: "times",
    error: `${address} ${"x".repeat(400)}`,
  });
  assert.doesNotMatch(clipped, /[?&](address|service|notes|placeId)=/);
  assert.ok(clipped.length < 320);
});
