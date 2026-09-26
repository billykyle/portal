import assert from "node:assert/strict";
import { test } from "node:test";
import {
  discoverUgreenRelayOrigin,
  nasHostsMatch,
  relayOriginFromNodeInfo,
  shareSessionMatchesRelay,
  ugreenLinkAlias,
} from "./nas-relay";

test("the UGREENlink id comes from the regional host or the share URL", () => {
  assert.equal(ugreenLinkAlias("https://10128873.us15.ug.link"), "10128873");
  assert.equal(ugreenLinkAlias("https://10128873.us5.ug.link/filemgr/share-download/"), "10128873");
  assert.equal(
    ugreenLinkAlias("https://ug.link/10128873/filemgr/share-download/?id=abc"),
    "10128873",
  );
  assert.equal(
    ugreenLinkAlias("https://www.ug.link/10128873/filemgr/share-download/?id=abc"),
    "10128873",
  );
  assert.equal(ugreenLinkAlias("https://example.com"), null);
});

test("nodeInfo relayDomain becomes the device API origin", () => {
  assert.equal(
    relayOriginFromNodeInfo("10128873", {
      code: 200,
      data: { relayDomain: "us5.ug.link" },
    }),
    "https://10128873.us5.ug.link",
  );
  assert.equal(relayOriginFromNodeInfo("10128873", { code: 500, data: {} }), null);
  assert.equal(relayOriginFromNodeInfo("10128873", { code: 200, data: { relayDomain: "" } }), null);
});

test("a share cookie from the old relay is not reused", () => {
  const session = { host: "https://10128873.us15.ug.link", cookie: "share=1" };
  assert.equal(shareSessionMatchesRelay(session, "https://10128873.us15.ug.link/"), true);
  assert.equal(shareSessionMatchesRelay(session, "https://10128873.us5.ug.link"), false);
  assert.equal(shareSessionMatchesRelay(session, "https://10128873.us15.ug.link", "share=1"), false);
  assert.equal(nasHostsMatch("https://10128873.us5.ug.link", "https://10128873.us5.ug.link/"), true);
});

test("relay lookup posts the alias and uses the returned region", async () => {
  const seen: { url: string; body: string } = { url: "", body: "" };
  const origin = await discoverUgreenRelayOrigin("10128873", async (input, init) => {
    seen.url = String(input);
    seen.body = String(init?.body ?? "");
    return new Response(
      JSON.stringify({ code: 200, data: { relayDomain: "us5.ug.link" }, msg: "SUCCESS" }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }, 30);
  assert.equal(origin, "https://10128873.us5.ug.link");
  assert.equal(seen.url, "https://api.ugnas.com/api/p2p/v2/ta/nodeInfo/byAlias");
  assert.equal(seen.body, JSON.stringify({ alias: "10128873" }));
});
