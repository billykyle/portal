/** Bust a failed tile request so Safari/Chrome will try the proxy again. */
export function withThumbRetry(url: string, attempt: number) {
  if (attempt <= 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}retry=${attempt}`;
}

export const THUMB_RETRY_LIMIT = 2;
