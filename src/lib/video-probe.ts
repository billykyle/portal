/**
 * Display size of an MP4/MOV from the `tkhd` box, including a 90°/270° display matrix.
 * The moov atom is often at the end of a camera `.mov`, so callers fetch a short
 * header, then only the byte range that actually holds moov — never the picture data.
 */

export type VideoDisplaySize = { width: number; height: number };

export type ProbeChunk = { start: number; bytes: Buffer };

export type ProbeStep =
  | { action: "fetch"; start: number; end: number }
  | { action: "done"; size: VideoDisplaySize }
  | { action: "unknown" };

const PROBE_CHUNK = 256 * 1024;
const MAX_MOOV = 8 * 1024 * 1024;
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "mvex"]);

type BoxHeader = { type: string; size: number; header: number };

export function nextVideoProbe(input: { chunks: ProbeChunk[]; fileSize: number | null }): ProbeStep {
  const head = input.chunks.find((chunk) => chunk.start === 0);
  if (!head) {
    const end = input.fileSize == null ? PROBE_CHUNK - 1 : Math.min(PROBE_CHUNK, input.fileSize) - 1;
    return end < 0 ? { action: "unknown" } : { action: "fetch", start: 0, end };
  }

  let offset = 0;
  const limit = input.fileSize ?? Number.POSITIVE_INFINITY;
  while (offset < limit) {
    const header = readBoxHeader(input.chunks, offset, input.fileSize);
    if (header === "need") {
      const reach = input.fileSize == null ? offset + PROBE_CHUNK - 1 : Math.min(offset + PROBE_CHUNK, input.fileSize) - 1;
      if (reach < offset) return { action: "unknown" };
      return { action: "fetch", start: offset, end: reach };
    }
    if (header === "bad") return { action: "unknown" };
    if (header.type === "moov") {
      const want = Math.min(header.size, MAX_MOOV);
      const moov = readRange(input.chunks, offset, want);
      if (!moov || moov.length < want) {
        return { action: "fetch", start: offset, end: offset + want - 1 };
      }
      const size = displaySizeFromMoov(moov);
      return size ? { action: "done", size } : { action: "unknown" };
    }
    const next = offset + header.size;
    if (!(next > offset)) return { action: "unknown" };
    if (input.fileSize != null && next > input.fileSize) return { action: "unknown" };
    offset = next;
  }
  return { action: "unknown" };
}

export function displaySizeFromMoov(bytes: Buffer): VideoDisplaySize | null {
  let best: VideoDisplaySize | null = null;
  let bestArea = 0;
  const visit = (buf: Buffer) => {
    let offset = 0;
    while (offset + 8 <= buf.length) {
      const box = readBufferBox(buf, offset);
      if (!box) break;
      const bodyStart = offset + box.header;
      const bodyEnd = Math.min(offset + box.size, buf.length);
      if (bodyStart > buf.length) break;
      if (box.type === "tkhd") {
        const size = parseTkhd(buf.subarray(bodyStart, bodyEnd));
        if (size) {
          const area = size.width * size.height;
          if (area > bestArea) {
            best = size;
            bestArea = area;
          }
        }
      } else if (CONTAINERS.has(box.type) && bodyEnd > bodyStart) {
        visit(buf.subarray(bodyStart, bodyEnd));
      }
      offset += box.size;
    }
  };
  visit(bytes);
  return best;
}

/** Shorter side of the displayed frame. 720p/1080p are defined on that side. */
export function shorterSide(size: VideoDisplaySize) {
  return Math.min(size.width, size.height);
}

function readRange(chunks: ProbeChunk[], start: number, length: number) {
  if (length <= 0) return null;
  for (const chunk of chunks) {
    const end = chunk.start + chunk.bytes.length;
    if (chunk.start <= start && end >= start + length) {
      const offset = start - chunk.start;
      return chunk.bytes.subarray(offset, offset + length);
    }
    if (chunk.start <= start && end > start) {
      return chunk.bytes.subarray(start - chunk.start);
    }
  }
  return null;
}

function readBoxHeader(chunks: ProbeChunk[], offset: number, fileSize: number | null): BoxHeader | "need" | "bad" {
  const prefix = readRange(chunks, offset, 16);
  if (!prefix || prefix.length < 8) return "need";
  let size = prefix.readUInt32BE(0);
  const type = prefix.toString("latin1", 4, 8);
  let header = 8;
  if (!/^[ -~]{4}$/.test(type)) return "bad";
  if (size === 1) {
    if (prefix.length < 16) return "need";
    const large = prefix.readBigUInt64BE(8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return "bad";
    size = Number(large);
    header = 16;
  } else if (size === 0) {
    if (fileSize == null || fileSize < offset + header) return "need";
    size = fileSize - offset;
  }
  if (size < header) return "bad";
  return { type, size, header };
}

function readBufferBox(buf: Buffer, offset: number): BoxHeader | null {
  if (offset + 8 > buf.length) return null;
  let size = buf.readUInt32BE(offset);
  const type = buf.toString("latin1", offset + 4, offset + 8);
  let header = 8;
  if (!/^[ -~]{4}$/.test(type)) return null;
  if (size === 1) {
    if (offset + 16 > buf.length) return null;
    const large = buf.readBigUInt64BE(offset + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(large);
    header = 16;
  } else if (size === 0) {
    size = buf.length - offset;
  }
  if (size < header) return null;
  return { type, size, header };
}

function parseTkhd(body: Buffer): VideoDisplaySize | null {
  if (body.length < 4) return null;
  const version = body[0] ?? 0;
  const matrixAt = version === 1 ? 52 : 40;
  const widthAt = matrixAt + 36;
  if (body.length < widthAt + 8) return null;
  const matrix = Array.from({ length: 9 }, (_, index) => body.readInt32BE(matrixAt + index * 4) / 65536);
  let width = body.readUInt32BE(widthAt) / 65536;
  let height = body.readUInt32BE(widthAt + 4) / 65536;
  if (quarterTurn(matrix)) {
    const swap = width;
    width = height;
    height = swap;
  }
  const rounded = { width: Math.round(width), height: Math.round(height) };
  if (rounded.width < 16 || rounded.height < 16) return null;
  if (rounded.width > 8000 || rounded.height > 8000) return null;
  return rounded;
}

/** 90° or 270° display matrix. 0° and 180° keep the stored width and height. */
function quarterTurn(matrix: number[]) {
  const a = matrix[0] ?? 0;
  const b = matrix[1] ?? 0;
  const c = matrix[3] ?? 0;
  const d = matrix[4] ?? 0;
  return Math.abs(a) < 0.5 && Math.abs(d) < 0.5 && Math.abs(b) > 0.5 && Math.abs(c) > 0.5;
}
