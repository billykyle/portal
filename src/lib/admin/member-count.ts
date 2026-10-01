import { isPendingClientEmail } from "@/lib/signup-fields";

/** Signed-up teammate logins. A client invite with no accounts is 0. `@pending.local` is not a signup. */
export function signedUpMemberCount(logins: readonly { email: string }[] | null | undefined) {
  if (!logins) return 0;
  return logins.reduce((total, login) => (isPendingClientEmail(login.email) ? total : total + 1), 0);
}
