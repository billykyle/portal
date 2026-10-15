import { createHmac, createPrivateKey, timingSafeEqual } from "crypto";
import { SignJWT } from "jose";
import { MUX_PLAYBACK_TTL_SECONDS, MUX_SOURCE_TTL_SECONDS, muxDownloadStem, muxStaticDownloadUrl } from "./mux-policy";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export function muxCredentials() {
  const id = process.env.MUX_TOKEN_ID?.trim() ?? "";
  const secret = process.env.MUX_TOKEN_SECRET?.trim() ?? "";
  if (!id || !secret) return null;
  return { id, secret };
}

export function portalPublicOrigin() {
  const raw = process.env.PORTAL_PUBLIC_URL?.trim() || "https://portal.billy-kyle.com";
  return raw.replace(/\/+$/, "");
}

export function muxWebhookAddress() {
  return `${portalPublicOrigin()}/api/mux/webhook`;
}

function sourceSecret() {
  return process.env.MUX_TOKEN_SECRET?.trim() || process.env.JWT_SECRET?.trim() || "";
}

export function signMuxSource(mediaId: string, exp: number, secret = sourceSecret()) {
  return createHmac("sha256", secret).update(`${mediaId}.${exp}`).digest("base64url");
}

export function muxSourceUrl(mediaId: string, nowMs = Date.now()) {
  const secret = sourceSecret();
  if (!secret) throw new Error("Mux source URLs need MUX_TOKEN_SECRET or JWT_SECRET.");
  const exp = Math.floor(nowMs / 1000) + MUX_SOURCE_TTL_SECONDS;
  const url = new URL(`/api/mux/source/${mediaId}`, portalPublicOrigin());
  url.searchParams.set("exp", String(exp));
  url.searchParams.set("sig", signMuxSource(mediaId, exp, secret));
  return url.toString();
}

export function verifyMuxSource(mediaId: string, expRaw: string | null, sig: string | null, nowMs = Date.now()) {
  const secret = sourceSecret();
  const exp = Number(expRaw);
  if (!secret || !sig || !Number.isFinite(exp)) return false;
  if (exp * 1000 < nowMs) return false;
  const expected = signMuxSource(mediaId, exp, secret);
  const left = Buffer.from(expected);
  const right = Buffer.from(sig);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function decodeMuxPrivateKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN")) return trimmed;
  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  if (!decoded.includes("BEGIN")) throw new Error("Mux signing key is not a PEM.");
  return decoded;
}

export function muxPrivateKey(value: string) {
  return createPrivateKey(decodeMuxPrivateKey(value));
}

export async function signMuxPlaybackToken(input: {
  playbackId: string;
  keyId: string;
  privateKey: string;
  ttlSeconds?: number;
  download?: string;
}) {
  const key = muxPrivateKey(input.privateKey);
  const claims: Record<string, string> = { kid: input.keyId };
  if (input.download) claims.download = input.download;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: input.keyId, typ: "JWT" })
    .setSubject(input.playbackId)
    .setAudience("v")
    .setExpirationTime(`${input.ttlSeconds ?? MUX_PLAYBACK_TTL_SECONDS}s`)
    .sign(key);
}

export async function muxPlaybackLinks(input: {
  playbackId: string;
  filename: string;
  keyId: string;
  privateKey: string;
  staticReady: boolean;
}) {
  const token = await signMuxPlaybackToken({
    playbackId: input.playbackId,
    keyId: input.keyId,
    privateKey: input.privateKey,
  });
  const downloadUrl = input.staticReady
    ? muxStaticDownloadUrl(
        input.playbackId,
        await signMuxPlaybackToken({
          playbackId: input.playbackId,
          keyId: input.keyId,
          privateKey: input.privateKey,
          download: muxDownloadStem(input.filename),
        }),
        input.filename,
      )
    : null;
  return { token, downloadUrl };
}

export function verifyMuxWebhook(rawBody: string, header: string | null, secret: string, nowMs = Date.now()) {
  if (!header || !secret) return false;
  let timestamp = "";
  let signature = "";
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1") signature = value;
  }
  const issued = Number(timestamp);
  if (!timestamp || !signature || !Number.isFinite(issued)) return false;
  if (Math.abs(nowMs / 1000 - issued) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function muxDashboardSteps() {
  const address = muxWebhookAddress();
  return [
    "The Mux token cannot create a signing key or webhook (it needs System write), so Billy creates both in the Mux dashboard and sets them on the Vercel project for Production and Preview, then redeploys.",
    `1. Settings → Signing Keys → Generate new key. Put the Key ID in MUX_SIGNING_KEY_ID and the base64 private key (shown once) in MUX_SIGNING_KEY.`,
    `2. Settings → Webhooks → add ${address}. Put the signing secret in MUX_WEBHOOK_SECRET.`,
    "MUX_TOKEN_ID and MUX_TOKEN_SECRET stay as they are.",
  ].join(" ");
}
