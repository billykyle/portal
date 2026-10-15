import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { importSPKI, jwtVerify } from "jose";
import {
  muxSourceUrl,
  signMuxPlaybackToken,
  signMuxSource,
  verifyMuxSource,
  verifyMuxWebhook,
} from "./mux-sign";

test("source links expire and reject a bad signature", () => {
  process.env.MUX_TOKEN_SECRET = "source-secret";
  const url = new URL(muxSourceUrl("media-1", 1_700_000_000_000));
  assert.equal(url.pathname, "/api/mux/source/media-1");
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  assert.equal(verifyMuxSource("media-1", exp, sig, 1_700_000_000_000), true);
  assert.equal(verifyMuxSource("media-1", exp, sig, 1_700_000_000_000 + 13 * 60 * 60 * 1000), false);
  assert.equal(verifyMuxSource("media-1", exp, "nope", 1_700_000_000_000), false);
  assert.equal(signMuxSource("media-1", 10, "source-secret"), signMuxSource("media-1", 10, "source-secret"));
});

test("playback tokens are signed for one playback id and can include a download name", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const spki = publicKey.export({ type: "spki", format: "pem" }).toString();
  const token = await signMuxPlaybackToken({
    playbackId: "play-1",
    keyId: "key-1",
    privateKey: pem,
    ttlSeconds: 60,
    download: "tour",
  });
  const verified = await jwtVerify(token, await importSPKI(spki, "RS256"), { audience: "v" });
  assert.equal(verified.payload.sub, "play-1");
  assert.equal(verified.payload.kid, "key-1");
  assert.equal(verified.payload.download, "tour");
  assert.equal(verified.protectedHeader.kid, "key-1");
});

test("playback tokens accept a base64 PKCS1 private key", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
  const spki = publicKey.export({ type: "spki", format: "pem" }).toString();
  const token = await signMuxPlaybackToken({
    playbackId: "play-2",
    keyId: "key-2",
    privateKey: Buffer.from(pem).toString("base64"),
    ttlSeconds: 60,
  });
  const verified = await jwtVerify(token, await importSPKI(spki, "RS256"), { audience: "v" });
  assert.equal(verified.payload.sub, "play-2");
  assert.equal(verified.protectedHeader.kid, "key-2");
});

test("webhook signatures use the raw body and a short tolerance", () => {
  const secret = "whsec";
  const body = '{"type":"video.asset.ready"}';
  const now = 1_700_000_000_000;
  const t = String(Math.floor(now / 1000));
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(verifyMuxWebhook(body, `t=${t},v1=${v1}`, secret, now), true);
  assert.equal(verifyMuxWebhook(body + " ", `t=${t},v1=${v1}`, secret, now), false);
  assert.equal(verifyMuxWebhook(body, `t=${Number(t) - 600},v1=${v1}`, secret, now), false);
});
