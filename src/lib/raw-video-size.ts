const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Human size for the raw-video header. One decimal under 10, otherwise a whole number. */
export function formatMediaSize(bytes: number) {
  const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (safe >= GB) return `${formatUnit(safe / GB)} GB`;
  if (safe >= MB) return `${formatUnit(safe / MB)} MB`;
  if (safe >= KB) return `${formatUnit(safe / KB)} KB`;
  return `${Math.round(safe)} B`;
}

function formatUnit(value: number) {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

/**
 * "12 files · 4.2 GB" for the Raw video header.
 * Size is omitted until every clip has a known byte size, so a partial sum is not shown as the total.
 */
export function rawVideoHeaderDetail(files: ReadonlyArray<{ byteSize?: number | null }>) {
  const count = files.length;
  const filesLabel = count === 1 ? "1 file" : `${count} files`;
  if (count === 0) return filesLabel;
  const known = files.every(
    (file) => typeof file.byteSize === "number" && Number.isFinite(file.byteSize) && file.byteSize >= 0,
  );
  if (!known) return filesLabel;
  const total = files.reduce((sum, file) => sum + (file.byteSize ?? 0), 0);
  return `${filesLabel} · ${formatMediaSize(total)}`;
}
