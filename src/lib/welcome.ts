/** Greeting for invite onboarding. No name → “Welcome” without a dangling comma. */
export function welcomeClientLabel(displayName: string | null | undefined) {
  const name = displayName?.trim();
  if (!name) return "Welcome";
  return `Welcome, ${name}`;
}
