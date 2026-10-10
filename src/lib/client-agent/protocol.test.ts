import assert from "node:assert/strict";
import { test } from "node:test";
import {
  authorizationServerMetadata,
  mcpResourceUrl,
  pkceMatches,
  pkceS256,
  protectedResourceMetadata,
  safeOauthReturn,
  validRedirectUri,
  wwwAuthenticate,
} from "./protocol";

test("PKCE S256 matches the RFC 7636 appendix vector", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  assert.equal(pkceS256(verifier), challenge);
  assert.equal(pkceMatches(verifier, challenge), true);
  assert.equal(pkceMatches(`${verifier}x`, challenge), false);
});

test("redirect URIs allow https, loopback, and private schemes", () => {
  assert.equal(validRedirectUri("https://example.com/callback"), true);
  assert.equal(validRedirectUri("http://127.0.0.1:8787/callback"), true);
  assert.equal(validRedirectUri("http://localhost:3000/cb"), true);
  assert.equal(validRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback"), true);
  assert.equal(validRedirectUri("http://evil.example/callback"), false);
  assert.equal(validRedirectUri("javascript:alert(1)"), false);
  assert.equal(validRedirectUri("https://example.com/callback#frag"), false);
});

test("oauth metadata points at the client connector", () => {
  const origin = "https://portal.billy-kyle.com";
  const auth = authorizationServerMetadata(origin);
  assert.equal(auth.issuer, origin);
  assert.equal(auth.authorization_endpoint, `${origin}/oauth/authorize`);
  assert.equal(auth.token_endpoint, `${origin}/oauth/token`);
  assert.equal(auth.registration_endpoint, `${origin}/oauth/register`);
  assert.equal(auth.revocation_endpoint, `${origin}/oauth/revoke`);
  assert.deepEqual(auth.code_challenge_methods_supported, ["S256"]);
  assert.ok(auth.grant_types_supported.includes("refresh_token"));
  const resource = protectedResourceMetadata(origin);
  assert.equal(resource.resource, mcpResourceUrl(origin));
  assert.deepEqual(resource.authorization_servers, [origin]);
  assert.match(wwwAuthenticate(origin, "invalid_token"), /oauth-protected-resource\/api\/client\/mcp/);
});

test("sign-in return stays on the authorize page", () => {
  const ok = "/oauth/authorize?client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A9%2Fcb";
  assert.equal(safeOauthReturn(ok), ok);
  assert.equal(safeOauthReturn("https://evil.example/oauth/authorize?x=1"), null);
  assert.equal(safeOauthReturn("/home"), null);
  assert.equal(safeOauthReturn("//evil.example"), null);
});
