/** True on Vercel builds and serverless functions. */
export function isVercelRuntime() {
  return process.env.VERCEL === "1";
}

/** In-process timers do not keep ticking across frozen serverless isolates. */
export function useInProcessNasScheduler() {
  return !isVercelRuntime();
}
