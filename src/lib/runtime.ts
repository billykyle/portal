/** True on Vercel builds and serverless functions. */
export function isVercelRuntime() {
  return process.env.VERCEL === "1";
}
