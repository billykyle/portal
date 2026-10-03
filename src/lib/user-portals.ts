import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients, userClients, users, type User } from "@/lib/db/schema";
import { isInviteCode, normalizeInviteCode } from "@/lib/invite";

export type UserPortal = {
  id: string;
  inviteCode: string;
  displayName: string;
  company: string | null;
};

export type DirectoryLogin = {
  userId: string;
  clientId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  createdAt: Date;
};

export function mergePortals(home: UserPortal | null, extras: readonly UserPortal[]) {
  const seen = new Set<string>();
  const rows = [...(home ? [home] : []), ...extras].filter((portal) => {
    if (seen.has(portal.id)) return false;
    seen.add(portal.id);
    return true;
  });
  return rows.sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.inviteCode.localeCompare(b.inviteCode),
  );
}

/** One portal signs straight in. More than one stops on the chooser. */
export function signInDestination(portals: readonly Pick<UserPortal, "id" | "inviteCode">[]) {
  if (portals.length === 0) return { kind: "missing" as const };
  if (portals.length === 1) {
    return { kind: "portal" as const, clientId: portals[0].id, inviteCode: portals[0].inviteCode };
  }
  return { kind: "choose" as const };
}

export function extraCodeDecision(input: {
  rawCode: string;
  homeClientId: string;
  attachedClientIds: readonly string[];
  foundClientId: string | null;
}): { ok: true; clientId: string } | { ok: false; error: string } {
  const code = normalizeInviteCode(input.rawCode);
  if (!isInviteCode(code)) return { ok: false, error: "Invite codes look like BK00001." };
  if (!input.foundClientId) return { ok: false, error: "That invite code was not found." };
  if (input.foundClientId === input.homeClientId || input.attachedClientIds.includes(input.foundClientId)) {
    return { ok: false, error: "This login already uses that code." };
  }
  return { ok: true, clientId: input.foundClientId };
}

function portalFrom(client: {
  id: string;
  inviteCode: string;
  displayName: string;
  company: string | null;
}): UserPortal {
  return {
    id: client.id,
    inviteCode: client.inviteCode,
    displayName: client.displayName,
    company: client.company,
  };
}

export async function listPortalsForUser(userId: string) {
  await ensureDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return [];
  const [home] = await db.select().from(clients).where(eq(clients.id, user.clientId)).limit(1);
  const extras = await db
    .select({
      id: clients.id,
      inviteCode: clients.inviteCode,
      displayName: clients.displayName,
      company: clients.company,
    })
    .from(userClients)
    .innerJoin(clients, eq(clients.id, userClients.clientId))
    .where(eq(userClients.userId, userId));
  return mergePortals(home ? portalFrom(home) : null, extras.map(portalFrom));
}

export async function userBelongsToClient(userId: string, clientId: string) {
  const portals = await listPortalsForUser(userId);
  return portals.some((portal) => portal.id === clientId);
}

export async function listMemberUsers(clientId: string): Promise<User[]> {
  await ensureDb();
  const [home, extras] = await Promise.all([
    db.select().from(users).where(eq(users.clientId, clientId)).orderBy(desc(users.createdAt)),
    db
      .select({ user: users })
      .from(userClients)
      .innerJoin(users, eq(users.id, userClients.userId))
      .where(eq(userClients.clientId, clientId))
      .orderBy(desc(userClients.createdAt)),
  ]);
  const seen = new Set(home.map((user) => user.id));
  const merged = [...home];
  for (const row of extras) {
    if (seen.has(row.user.id)) continue;
    seen.add(row.user.id);
    merged.push(row.user);
  }
  return merged;
}

export async function listClientMembers(clientId: string) {
  const members = await listMemberUsers(clientId);
  const homeIds = [...new Set(members.map((user) => user.clientId))];
  const homes =
    homeIds.length === 0
      ? []
      : await db
          .select({ id: clients.id, inviteCode: clients.inviteCode, displayName: clients.displayName })
          .from(clients)
          .where(inArray(clients.id, homeIds));
  const byId = new Map(homes.map((client) => [client.id, client]));
  return members.map((user) => ({
    ...user,
    signupInviteCode: byId.get(user.clientId)?.inviteCode ?? "",
    signupName: byId.get(user.clientId)?.displayName ?? "",
  }));
}

/** Home client plus every extra code, so admin lists and mail see the same people. */
export async function directoryLogins(): Promise<DirectoryLogin[]> {
  await ensureDb();
  const [home, extras] = await Promise.all([
    db
      .select({
        userId: users.id,
        clientId: users.clientId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt)),
    db
      .select({
        userId: users.id,
        clientId: userClients.clientId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(userClients)
      .innerJoin(users, eq(users.id, userClients.userId))
      .orderBy(asc(userClients.createdAt)),
  ]);
  const seen = new Set(home.map((row) => `${row.clientId}:${row.userId}`));
  return [...home, ...extras.filter((row) => !seen.has(`${row.clientId}:${row.userId}`))];
}

/** Login emails for these clients only. Home logins first, then extra BK codes, one row per address. */
export async function memberEmailsForClients(clientIds: readonly string[]) {
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return [] as { clientId: string; email: string }[];
  await ensureDb();
  const [home, extras] = await Promise.all([
    db
      .select({ clientId: users.clientId, email: users.email })
      .from(users)
      .where(inArray(users.clientId, ids))
      .orderBy(asc(users.createdAt)),
    db
      .select({ clientId: userClients.clientId, email: users.email })
      .from(userClients)
      .innerJoin(users, eq(users.id, userClients.userId))
      .where(inArray(userClients.clientId, ids))
      .orderBy(asc(userClients.createdAt)),
  ]);
  const seen = new Set<string>();
  const rows: { clientId: string; email: string }[] = [];
  for (const login of [...home, ...extras]) {
    const key = `${login.clientId}:${login.email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(login);
  }
  return rows;
}

export async function addExtraInviteCode(input: { userId: string; code: string }) {
  await ensureDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) return { ok: false as const, error: "User was not found." };
  const code = normalizeInviteCode(input.code);
  const [found] = isInviteCode(code)
    ? await db.select({ id: clients.id }).from(clients).where(eq(clients.inviteCode, code)).limit(1)
    : [];
  const attached = await db
    .select({ clientId: userClients.clientId })
    .from(userClients)
    .where(eq(userClients.userId, user.id));
  const decision = extraCodeDecision({
    rawCode: input.code,
    homeClientId: user.clientId,
    attachedClientIds: attached.map((row) => row.clientId),
    foundClientId: found?.id ?? null,
  });
  if (!decision.ok) return decision;
  await db.insert(userClients).values({ userId: user.id, clientId: decision.clientId });
  return { ok: true as const, inviteCode: code, clientId: decision.clientId };
}

export async function removeExtraInviteCode(input: { userId: string; clientId: string }) {
  await ensureDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) return { ok: false as const, error: "User was not found." };
  if (user.clientId === input.clientId) {
    return { ok: false as const, error: "That is the code they signed up with." };
  }
  const attached = await db
    .select({ clientId: userClients.clientId })
    .from(userClients)
    .where(eq(userClients.userId, user.id));
  if (!attached.some((item) => item.clientId === input.clientId)) {
    return { ok: false as const, error: "That code is not on this login." };
  }
  await db
    .delete(userClients)
    .where(and(eq(userClients.userId, user.id), eq(userClients.clientId, input.clientId)));
  return { ok: true as const, email: user.email };
}
