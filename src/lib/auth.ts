import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "bk_session";
export const INVITE_COOKIE = "bk_invite";
export const PORTAL_CHOICE_COOKIE = "bk_portal_choice";

export type Session = {
  userId: string;
  email: string;
  clientId: string;
  inviteCode: string;
};

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    throw new Error("JWT_SECRET is not set.");
  }
  return new TextEncoder().encode(value);
}

export async function signSession(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function readSessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.userId || !payload.email || !payload.clientId || !payload.inviteCode) {
      return null;
    }
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      clientId: String(payload.clientId),
      inviteCode: String(payload.inviteCode),
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

export async function createSession(session: Session) {
  const token = await signSession(session);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function createPortalChoice(choice: { userId: string; email: string }) {
  const token = await new SignJWT({ ...choice, purpose: "choose" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
  const store = await cookies();
  store.set(PORTAL_CHOICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60,
  });
}

export async function readPortalChoiceToken(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== "choose" || !payload.userId || !payload.email) return null;
    return { userId: String(payload.userId), email: String(payload.email) };
  } catch {
    return null;
  }
}

export async function getPortalChoice() {
  const store = await cookies();
  const token = store.get(PORTAL_CHOICE_COOKIE)?.value;
  if (!token) return null;
  return readPortalChoiceToken(token);
}

export async function clearPortalChoice() {
  const store = await cookies();
  store.delete(PORTAL_CHOICE_COOKIE);
}

export async function setInviteCookie(code: string) {
  const store = await cookies();
  store.set(INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function getInviteCookie() {
  const store = await cookies();
  return store.get(INVITE_COOKIE)?.value ?? null;
}

export async function clearInviteCookie() {
  const store = await cookies();
  store.delete(INVITE_COOKIE);
}
