/** UGOS errors that mean the share cookie is missing or dead. */
export function isNasAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("not configured")) return false;
  return (
    lower.includes("named cookie not present") ||
    lower.includes("share cookie") ||
    lower.includes("share verify") ||
    lower.includes("verify share") ||
    lower.includes("unauthorized")
  );
}
