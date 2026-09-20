export type SignupProfile = {
  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
  email: string;
};

export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return trimmed;
}

export function parseSignupProfile(input: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
}): { ok: true; value: SignupProfile } | { ok: false; error: string } {
  const firstName = String(input.firstName ?? "").trim();
  const lastName = String(input.lastName ?? "").trim();
  const companyName = String(input.companyName ?? "").trim();
  const phone = normalizePhone(String(input.phone ?? ""));
  const email = String(input.email ?? "").trim().toLowerCase();

  if (!firstName) return { ok: false, error: "Enter a first name." };
  if (!lastName) return { ok: false, error: "Enter a last name." };
  if (!companyName) return { ok: false, error: "Enter a company name." };
  if (!phone) return { ok: false, error: "Enter a valid phone number." };
  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email." };
  return { ok: true, value: { firstName, lastName, companyName, phone, email } };
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
