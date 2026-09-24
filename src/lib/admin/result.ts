export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function adminFail(error: string): AdminResult<never> {
  return { ok: false, error };
}
