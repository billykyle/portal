import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemberRoleForm } from "@/components/forms/member-role-form";
import {
  MEMBER_ROLES_BY_CATEGORY,
  categoryUsesMemberRoles,
  effectiveMemberRole,
  memberReceivesShootEmail,
  memberRoleNeedsReassignment,
  parseMemberRoleForCategory,
  rolesForCategory,
} from "./member-role";

test("only real estate has roles, and they are one config", () => {
  assert.deepEqual(rolesForCategory("real_estate"), ["team_lead", "assistant", "agent"]);
  assert.equal(categoryUsesMemberRoles("real_estate"), true);
  for (const category of ["construction", "podcast", "other", "commercial"] as const) {
    assert.deepEqual(MEMBER_ROLES_BY_CATEGORY[category], []);
    assert.equal(categoryUsesMemberRoles(category), false);
  }
});

test("a role from another category is blank for mail and needs reassignment", () => {
  assert.equal(effectiveMemberRole("real_estate", "team_lead"), "team_lead");
  assert.equal(effectiveMemberRole("real_estate", "not_a_role"), null);
  assert.equal(effectiveMemberRole("construction", "team_lead"), null);
  assert.equal(memberRoleNeedsReassignment("construction", "team_lead"), true);
  assert.equal(memberRoleNeedsReassignment("real_estate", "team_lead"), false);
  assert.equal(memberRoleNeedsReassignment("real_estate", null), false);
  assert.equal(parseMemberRoleForCategory("real_estate", "agent").ok, true);
  assert.equal(parseMemberRoleForCategory("real_estate", "").ok, true);
  assert.equal(parseMemberRoleForCategory("podcast", "agent").ok, false);
  assert.equal(parseMemberRoleForCategory("real_estate", "producer").ok, false);
});

test("team lead and assistant get every shoot, agent and blank only their own", () => {
  assert.equal(memberReceivesShootEmail({ category: "real_estate", role: "team_lead", isContact: false }), true);
  assert.equal(memberReceivesShootEmail({ category: "real_estate", role: "assistant", isContact: false }), true);
  assert.equal(memberReceivesShootEmail({ category: "real_estate", role: "agent", isContact: false }), false);
  assert.equal(memberReceivesShootEmail({ category: "real_estate", role: "agent", isContact: true }), true);
  assert.equal(memberReceivesShootEmail({ category: "real_estate", role: null, isContact: false }), false);
  assert.equal(memberReceivesShootEmail({ category: "real_estate", role: null, isContact: true }), true);
  assert.equal(memberReceivesShootEmail({ category: "real_estate", role: "team_lead", isContact: false }), true);
  assert.equal(memberReceivesShootEmail({ category: "other", role: null, isContact: false }), true);
});

test("the member role dropdown offers blank, the category roles, and a stale role", () => {
  const realEstate = renderToStaticMarkup(
    createElement(MemberRoleForm, {
      clientId: "c1",
      userId: "u1",
      category: "real_estate",
      role: "assistant",
    }),
  );
  assert.match(realEstate, /<option value="">—<\/option>/);
  assert.match(realEstate, /<option value="team_lead">Team Lead<\/option>/);
  assert.match(realEstate, /<option value="assistant" selected="">Assistant<\/option>/);
  assert.match(realEstate, /<option value="agent">Agent<\/option>/);
  assert.doesNotMatch(realEstate, /needs reassignment/);

  const stale = renderToStaticMarkup(
    createElement(MemberRoleForm, {
      clientId: "c1",
      userId: "u1",
      category: "construction",
      role: "team_lead",
    }),
  );
  assert.match(stale, /Team Lead — needs reassignment/);
  assert.match(stale, /Needs reassignment/);
  assert.doesNotMatch(stale, /<option value="assistant">/);
});
