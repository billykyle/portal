import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NAS_CONNECT_TIMEOUT_MS,
  NAS_UNREACHABLE_MESSAGE,
  isNasUnreachableError,
  nasConnectInit,
  nasWakeBudgetMs,
  readableNasError,
  withNasConnectRetry,
  withNasWake,
} from "./nas-connect";

test("UGOS device timeout and a hung fetch count as unreachable", () => {
  assert.equal(isNasUnreachableError(new Error("connect to device timeout")), true);
  assert.equal(isNasUnreachableError(new Error("Connect to device timeout")), true);
  assert.equal(isNasUnreachableError(new Error("NAS returned non-JSON (502): connect to device timeout")), true);
  const timedOut = new Error("The operation was aborted due to timeout");
  timedOut.name = "TimeoutError";
  assert.equal(isNasUnreachableError(timedOut), true);
  assert.equal(isNasUnreachableError(new TypeError("fetch failed")), true);
  assert.equal(isNasUnreachableError(new Error("NAS share verify failed.")), false);
  assert.equal(isNasUnreachableError(new Error("NAS share is not configured.")), false);
  assert.equal(isNasUnreachableError(new Error("wrong share password")), false);
});

test("reachable failures keep their message and a dead NAS gets one sentence", () => {
  assert.equal(readableNasError(new Error("connect to device timeout")), NAS_UNREACHABLE_MESSAGE);
  assert.equal(readableNasError(new Error("NAS share verify failed.")), "NAS share verify failed.");
  assert.equal(readableNasError("connect to device timeout"), NAS_UNREACHABLE_MESSAGE);
});

test("a dead connect is tried once more, a password error is not", async () => {
  let attempts = 0;
  await assert.rejects(
    () =>
      withNasConnectRetry(async () => {
        attempts += 1;
        throw new Error("connect to device timeout");
      }),
    /connect to device timeout/,
  );
  assert.equal(attempts, 2);

  let denied = 0;
  await assert.rejects(
    () =>
      withNasConnectRetry(async () => {
        denied += 1;
        throw new Error("NAS share verify failed.");
      }),
    /NAS share verify failed/,
  );
  assert.equal(denied, 1);
});

test("the second connect attempt can succeed", async () => {
  let attempts = 0;
  const value = await withNasConnectRetry(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("connect to device timeout");
    return "ok";
  });
  assert.equal(value, "ok");
  assert.equal(attempts, 2);
});

test("a sleeping NAS is warmed with a longer first try and pauses, under 90s", async () => {
  assert.equal(nasWakeBudgetMs(), 88_000);
  assert.ok(nasWakeBudgetMs() >= 60_000 && nasWakeBudgetMs() <= 90_000);
  assert.ok(nasWakeBudgetMs() < 300_000);
  const waits: number[] = [];
  const timeouts: number[] = [];
  let cleared = 0;
  await assert.rejects(
    () =>
      withNasWake(
        async (timeoutMs) => {
          timeouts.push(timeoutMs);
          throw new Error("connect to device timeout");
        },
        {
          sleep: async (ms) => {
            waits.push(ms);
          },
          onUnreachable: () => {
            cleared += 1;
          },
        },
      ),
    /connect to device timeout/,
  );
  assert.deepEqual(timeouts, [30_000, 22_000, 20_000]);
  assert.deepEqual(waits, [8_000, 8_000]);
  assert.equal(cleared, 2);

  let denied = 0;
  await assert.rejects(
    () =>
      withNasWake(async () => {
        denied += 1;
        throw new Error("NAS share verify failed.");
      }),
    /NAS share verify failed/,
  );
  assert.equal(denied, 1);
});

test("NAS API calls get a connect deadline unless the caller already set one", () => {
  const own = AbortSignal.timeout(20);
  const init = nasConnectInit({ method: "POST", signal: own });
  assert.equal(init.method, "POST");
  assert.equal(init.cache, "no-store");
  assert.equal(init.signal, own);
  assert.equal(NAS_CONNECT_TIMEOUT_MS, 15_000);
  const source = nasConnectInit.toString();
  assert.match(source, /AbortSignal\.timeout/);
});
