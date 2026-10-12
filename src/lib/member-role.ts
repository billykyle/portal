import { CLIENT_CATEGORY_LABEL, type ClientCategory } from "@/lib/client-category";

/**
 * Roles a signed-up login can hold on one client.
 * Add a category's roles in {@link MEMBER_ROLES_BY_CATEGORY}. An empty list
 * keeps that category on the old rule: every signed-up member gets every shoot email.
 */
export const MEMBER_ROLES = ["team_lead", "assistant", "agent"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_LABEL: Record<MemberRole, string> = {
  team_lead: "Team Lead",
  assistant: "Assistant",
  agent: "Agent",
};

export const MEMBER_ROLES_BY_CATEGORY: Record<ClientCategory, readonly MemberRole[]> = {
  real_estate: ["team_lead", "assistant", "agent"],
  construction: [],
  podcast: [],
  other: [],
  commercial: [],
};

export function categoryUsesMemberRoles(category: ClientCategory) {
  return MEMBER_ROLES_BY_CATEGORY[category].length > 0;
}

export function rolesForCategory(category: ClientCategory) {
  return MEMBER_ROLES_BY_CATEGORY[category];
}

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

export function memberRoleLabel(role: string | null | undefined) {
  if (!role) return "";
  return isMemberRole(role) ? MEMBER_ROLE_LABEL[role] : role;
}

/** A stored role counts only when this category lists it. Anything else is blank for mail. */
export function effectiveMemberRole(category: ClientCategory, role: string | null | undefined): MemberRole | null {
  if (!role || !isMemberRole(role)) return null;
  return MEMBER_ROLES_BY_CATEGORY[category].includes(role) ? role : null;
}

/** A saved role from another category. Mail treats it as blank once this category has roles. */
export function memberRoleNeedsReassignment(category: ClientCategory, role: string | null | undefined) {
  const stored = role?.trim() ?? "";
  if (!stored) return false;
  return effectiveMemberRole(category, stored) == null;
}

export function parseMemberRoleForCategory(
  category: ClientCategory,
  role: string | null | undefined,
): { ok: true; role: MemberRole | null } | { ok: false; error: string } {
  if (role == null || role.trim() === "") return { ok: true, role: null };
  const text = role.trim();
  const allowed = MEMBER_ROLES_BY_CATEGORY[category];
  if (!isMemberRole(text) || !allowed.includes(text)) {
    const labels = allowed.map((item) => MEMBER_ROLE_LABEL[item]);
    const list = labels.length > 0 ? labels.join(", ") : `none for ${CLIENT_CATEGORY_LABEL[category]}`;
    return { ok: false, error: `Role must be one of: ${list}.` };
  }
  return { ok: true, role: text };
}

/**
 * Whether this login is on the shoot email.
 * Team Lead and Assistant get every shoot. Agent and a blank role get a shoot
 * only when they are its contact: `bookings.createdByUserId`. That id is the
 * booker on a client booking and the primary-contact login an admin booking
 * attaches. A blank booker still gets mail about that shoot.
 * Categories with no roles include every member.
 */
export function memberReceivesShootEmail(input: {
  category: ClientCategory;
  role: string | null | undefined;
  isContact: boolean;
}) {
  if (!categoryUsesMemberRoles(input.category)) return true;
  const role = effectiveMemberRole(input.category, input.role);
  if (role === "team_lead" || role === "assistant") return true;
  if (role === "agent") return input.isContact;
  return input.isContact;
}
