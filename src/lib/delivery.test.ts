import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDeliveryPayload } from "./delivery";

test("builds a shoot.ready payload with an absolute public URL", () => {
  process.env.PORTAL_PUBLIC_URL = "http://127.0.0.1:43173";
  const payload = buildDeliveryPayload({
    event: "shoot.ready",
    client: {
      id: "c1",
      displayName: "Sam Lepore",
      inviteCode: "BK00004",
      primaryEmail: "sam@example.com",
    },
    shoot: {
      id: "s1",
      shotDate: "2026-09-04",
      address: "12 Wood View Drive",
      publicToken: "abc",
    },
    fileCount: 83,
  });
  assert.equal(payload.event, "shoot.ready");
  assert.equal(payload.shoot.publicUrl, "http://127.0.0.1:43173/s/abc");
  assert.equal(payload.shoot.fileCount, 83);
});
