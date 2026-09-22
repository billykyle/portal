export type AccountProfile = {
  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
};

export type SignupProfile = AccountProfile & {
  email: string;
};

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return trimmed;
}

export function parseAccountProfile(input: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
}): { ok: true; value: AccountProfile } | { ok: false; error: string } {
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  const companyName = String(input.companyName ?? "").trim();
  const phone = normalizePhone(String(input.phone ?? ""));

  if (!firstName) return { ok: false, error: "Enter a first name." };
  if (!lastName) return { ok: false, error: "Enter a last name." };
  if (!companyName) return { ok: false, error: "Enter a company name." };
  if (!phone) return { ok: false, error: "Enter a valid phone number." };
  return { ok: true, value: { firstName, lastName, companyName, phone } };
}

/** Login identity on `users.email`. Same bar as signup, plus a dotted domain. */
export function parseLoginEmail(
  raw: string | null | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.includes("..")) {
    return { ok: false, error: "Enter a valid email." };
  }
  return { ok: true, value: email };
}

export function parseSignupProfile(input: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
}): { ok: true; value: SignupProfile } | { ok: false; error: string } {
  const profile = parseAccountProfile(input);
  if (!profile.ok) return profile;
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email." };
  return { ok: true, value: { ...profile.value, email } };
}

export function parsePasswordChange(input: {
  currentPassword?: string | null;
  password?: string | null;
  confirm?: string | null;
}): { ok: true; value: { currentPassword: string; password: string } } | { ok: false; error: string } {
  const currentPassword = String(input.currentPassword ?? "");
  const password = String(input.password ?? "");
  const confirm = String(input.confirm ?? "");
  if (!currentPassword) return { ok: false, error: "Enter your current password." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, error: "Passwords do not match." };
  if (password === currentPassword) return { ok: false, error: "Choose a different new password." };
  return { ok: true, value: { currentPassword, password } };
}

export function isPendingClientEmail(email: string) {
  return email.trim().toLowerCase().endsWith("@pending.local");
}

export function teammateDisplayName(
  user: { firstName?: string | null; lastName?: string | null; email: string },
) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}
