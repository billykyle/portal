import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExtraBkCodes } from "@/components/forms/extra-bk-codes";
import { PortalChooser } from "@/components/portal-chooser";
import { extraCodeDecision, mergePortals, signInDestination } from "@/lib/user-portals";

test("one portal signs straight in and several stop to choose", () => {
  assert.deepEqual(signInDestination([]), { kind: "missing" });
  assert.deepEqual(signInDestination([{ id: "a", inviteCode: "BK00001" }]), {
    kind: "portal",
    clientId: "a",
    inviteCode: "BK00001",
  });
  assert.deepEqual(
    signInDestination([
      { id: "a", inviteCode: "BK00001" },
      { id: "b", inviteCode: "BK00002" },
    ]),
    { kind: "choose" },
  );
});

test("an extra BK code attaches a different client and refuses the signup code", () => {
  assert.deepEqual(
    extraCodeDecision({
      rawCode: "bk00007",
      homeClientId: "home",
      attachedClientIds: [],
      foundClientId: "other",
    }),
    { ok: true, clientId: "other" },
  );
  assert.deepEqual(
    extraCodeDecision({
      rawCode: "BK00004",
      homeClientId: "home",
      attachedClientIds: [],
      foundClientId: "home",
    }),
    { ok: false, error: "This login already uses that code." },
  );
  assert.deepEqual(
    extraCodeDecision({
      rawCode: "BK00007",
      homeClientId: "home",
      attachedClientIds: ["other"],
      foundClientId: "other",
    }),
    { ok: false, error: "This login already uses that code." },
  );
  assert.equal(
    extraCodeDecision({
      rawCode: "nope",
      homeClientId: "home",
      attachedClientIds: [],
      foundClientId: null,
    }).ok,
    false,
  );
  assert.equal(
    extraCodeDecision({
      rawCode: "BK00099",
      homeClientId: "home",
      attachedClientIds: [],
      foundClientId: null,
    }).ok,
    false,
  );
});

test("portals stay unique and sort by client name", () => {
  const merged = mergePortals(
    { id: "b", inviteCode: "BK00002", displayName: "Zebra", company: null },
    [
      { id: "b", inviteCode: "BK00002", displayName: "Zebra", company: null },
      { id: "a", inviteCode: "BK00008", displayName: "Harbor", company: "Harbor Co" },
    ],
  );
  assert.deepEqual(
    merged.map((portal) => portal.inviteCode),
    ["BK00008", "BK00002"],
  );
});

test("the chooser lists each portal and a single client has no chooser markup", () => {
  const html = renderToStaticMarkup(
    createElement(PortalChooser, {
      portals: [
        { id: "a", inviteCode: "BK00004", displayName: "Justin Heath", company: null },
        { id: "b", inviteCode: "BK00007", displayName: "Harbor Homes", company: "Harbor" },
      ],
    }),
  );
  assert.match(html, /Choose a portal/);
  assert.match(html, /Justin Heath/);
  assert.match(html, /BK00004/);
  assert.match(html, /Harbor Homes/);
  assert.match(html, /BK00007/);
  assert.match(html, /name="clientId"/);
  assert.equal(signInDestination([{ id: "a", inviteCode: "BK00004" }]).kind, "portal");
});

test("admin user controls add another BK code on the same login", () => {
  const html = renderToStaticMarkup(
    createElement(ExtraBkCodes, {
      clientId: "client-1",
      userId: "user-1",
      signupCode: "BK00004",
      extras: [{ id: "client-2", inviteCode: "BK00007", displayName: "Harbor Homes" }],
    }),
  );
  assert.match(html, /Other BK codes/);
  assert.match(html, /signed up with BK00004/);
  assert.match(html, /same email/);
  assert.match(html, /name="code"/);
  assert.match(html, /Add code/);
  assert.match(html, /BK00007/);
  assert.match(html, /Harbor Homes/);
  assert.match(html, /name="removeClientId"/);
});
