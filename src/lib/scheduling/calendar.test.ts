import assert from "node:assert/strict";
import { test } from "node:test";
import { collectFreeBusyIntervals } from "./calendar";
import {
  GCP_PROJECT_ID_KNOWN,
  PERSONAL_CALENDAR_ID,
  PORTAL_SCHEDULING_SA_EMAIL,
  VERCEL_TEAM_SLUG_KNOWN,
  WORK_CALENDAR_ID,
  iamProviderAudiences,
  isUsHolidayCalendar,
  isVercelTeamAudience,
  parseCalendarIds,
  readCalendarAuth,
  readCalendarCredentials,
  readCalendarIds,
  readVercelTeamSlug,
  readWorkloadIdentityConfig,
  teamSlugFromOidcIssuer,
  teamSlugFromOidcToken,
  vercelTeamOidcAudience,
  vercelTeamOidcIssuer,
} from "./config";
import { vercelOidcTokenOptions, wifClientOptions } from "./google-auth";

const WORK = WORK_CALENDAR_ID;
const PERSONAL = PERSONAL_CALENDAR_ID;
const HOLIDAY = "en.usa#holiday@group.v.calendar.google.com";

test("locked availability calendars are work + personal emails", () => {
  assert.equal(WORK, "billy@atmosimagery.com");
  assert.equal(PERSONAL, "bkyle015@gmail.com");
  assert.equal(PORTAL_SCHEDULING_SA_EMAIL, "portal-scheduling@glassy-polymer-509203-r1.iam.gserviceaccount.com");
  assert.equal(GCP_PROJECT_ID_KNOWN, "glassy-polymer-509203-r1");
});

test("parseCalendarIds prefers a comma list and drops US Holidays", () => {
  assert.deepEqual(parseCalendarIds(`${WORK}, ${PERSONAL}, ${HOLIDAY}`), [WORK, PERSONAL]);
  assert.deepEqual(parseCalendarIds(`${WORK}\n${PERSONAL}`), [WORK, PERSONAL]);
  assert.deepEqual(parseCalendarIds([WORK, WORK, PERSONAL]), [WORK, PERSONAL]);
  assert.deepEqual(parseCalendarIds(HOLIDAY), []);
  assert.equal(isUsHolidayCalendar(HOLIDAY), true);
  assert.equal(isUsHolidayCalendar(WORK), false);
});

test("readCalendarIds prefers GOOGLE_CALENDAR_IDS over singular GOOGLE_CALENDAR_ID", () => {
  const previous = {
    GOOGLE_CALENDAR_IDS: process.env.GOOGLE_CALENDAR_IDS,
    GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  };
  process.env.GOOGLE_CALENDAR_IDS = `${WORK},${PERSONAL},${HOLIDAY}`;
  process.env.GOOGLE_CALENDAR_ID = "someone-else@example.com";
  assert.deepEqual(readCalendarIds(), [WORK, PERSONAL]);

  delete process.env.GOOGLE_CALENDAR_IDS;
  process.env.GOOGLE_CALENDAR_ID = WORK;
  assert.deepEqual(readCalendarIds(), [WORK]);

  restoreEnv(previous);
});

const WIF_ENV = [
  "GCP_PROJECT_ID",
  "GCP_PROJECT_NUMBER",
  "GCP_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GCP_WORKLOAD_IDENTITY_POOL_ID",
  "GOOGLE_WORKLOAD_IDENTITY_POOL_ID",
  "GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID",
  "GCP_AUDIENCE",
  "VERCEL",
  "VERCEL_OIDC_TOKEN",
  "VERCEL_OIDC_TEAM_SLUG",
  "GCP_OIDC_TEAM_SLUG",
] as const;

function snapshotAuthEnv() {
  const keys = [
    "GOOGLE_CALENDAR_IDS",
    "GOOGLE_CALENDAR_ID",
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    ...WIF_ENV,
  ];
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function clearAuthEnv() {
  for (const key of Object.keys(snapshotAuthEnv())) {
    delete process.env[key];
  }
}

test("readCalendarCredentials needs at least one real calendar plus a service account", () => {
  const previous = snapshotAuthEnv();
  clearAuthEnv();
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sa@example.com";
  process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
  assert.equal(readCalendarCredentials(), null);

  process.env.GOOGLE_CALENDAR_IDS = `${WORK},${PERSONAL}`;
  const creds = readCalendarCredentials();
  assert.ok(creds);
  assert.deepEqual(creds.calendarIds, [WORK, PERSONAL]);
  assert.equal(creds.writeCalendarId, WORK);
  assert.equal(creds.auth.kind, "service-account-key");
  if (creds.auth.kind === "service-account-key") {
    assert.equal(creds.auth.clientEmail, "sa@example.com");
  }

  restoreEnv(previous);
});

test("WIF env configures Calendar without a private key", () => {
  const previous = snapshotAuthEnv();
  clearAuthEnv();
  process.env.GOOGLE_CALENDAR_IDS = `${WORK},${PERSONAL}`;
  process.env.GCP_PROJECT_ID = GCP_PROJECT_ID_KNOWN;
  process.env.GCP_PROJECT_NUMBER = "1234567890";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = PORTAL_SCHEDULING_SA_EMAIL;

  const creds = readCalendarCredentials();
  assert.ok(creds);
  assert.equal(creds.auth.kind, "wif");
  if (creds.auth.kind === "wif") {
    assert.equal(creds.auth.serviceAccountEmail, PORTAL_SCHEDULING_SA_EMAIL);
    assert.equal(
      creds.auth.stsAudience,
      "//iam.googleapis.com/projects/1234567890/locations/global/workloadIdentityPools/vercel/providers/vercel",
    );
    assert.equal(creds.auth.oidcAudience, vercelTeamOidcAudience(VERCEL_TEAM_SLUG_KNOWN));
    assert.equal(vercelOidcTokenOptions(creds.auth.oidcAudience), undefined);
  }

  restoreEnv(previous);
});

test("WIF wins on Vercel even if a local private key is also set", () => {
  const previous = snapshotAuthEnv();
  clearAuthEnv();
  process.env.GOOGLE_CALENDAR_IDS = WORK;
  process.env.VERCEL = "1";
  process.env.GCP_PROJECT_NUMBER = "1234567890";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = PORTAL_SCHEDULING_SA_EMAIL;
  process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";

  const auth = readCalendarAuth();
  assert.equal(auth?.kind, "wif");

  delete process.env.VERCEL;
  const local = readCalendarAuth();
  assert.equal(local?.kind, "service-account-key");

  process.env.VERCEL_OIDC_TOKEN = "oidc-dev-token";
  const pulled = readCalendarAuth();
  assert.equal(pulled?.kind, "wif");

  restoreEnv(previous);
});

test("empty GCP_AUDIENCE uses the Team-issuer Vercel aud, not the IAM provider URL", () => {
  const previous = snapshotAuthEnv();
  clearAuthEnv();
  process.env.GCP_PROJECT_NUMBER = "199448014322";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = PORTAL_SCHEDULING_SA_EMAIL;

  const cfg = readWorkloadIdentityConfig();
  assert.equal(cfg?.oidcAudience, "https://vercel.com/billy-kyle");
  assert.equal(
    cfg?.stsAudience,
    "//iam.googleapis.com/projects/199448014322/locations/global/workloadIdentityPools/vercel/providers/vercel",
  );
  assert.notEqual(cfg?.oidcAudience, `https:${cfg?.stsAudience}`);
  assert.equal(vercelOidcTokenOptions(cfg?.oidcAudience ?? ""), undefined);

  restoreEnv(previous);
});

test("Team issuer token and env slug win over the known-team fallback", () => {
  assert.equal(VERCEL_TEAM_SLUG_KNOWN, "billy-kyle");
  assert.equal(vercelTeamOidcIssuer("billy-kyle"), "https://oidc.vercel.com/billy-kyle");
  assert.equal(teamSlugFromOidcIssuer("https://oidc.vercel.com/billy-kyle"), "billy-kyle");
  assert.equal(isVercelTeamAudience("https://vercel.com/billy-kyle"), true);
  assert.equal(
    isVercelTeamAudience(
      "https://iam.googleapis.com/projects/199448014322/locations/global/workloadIdentityPools/vercel/providers/vercel",
    ),
    false,
  );

  const token = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        iss: "https://oidc.vercel.com/other-team",
        aud: "https://vercel.com/other-team",
      }),
    ).toString("base64url"),
    "sig",
  ].join(".");
  assert.equal(teamSlugFromOidcToken(token), "other-team");

  const previous = snapshotAuthEnv();
  clearAuthEnv();
  process.env.VERCEL_OIDC_TOKEN = token;
  assert.equal(readVercelTeamSlug(), "other-team");
  process.env.VERCEL_OIDC_TEAM_SLUG = "explicit-team";
  assert.equal(readVercelTeamSlug(), "explicit-team");
  restoreEnv(previous);
});

test("GCP_AUDIENCE overrides the OIDC token aud and can supply the STS audience", () => {
  const previous = snapshotAuthEnv();
  clearAuthEnv();
  process.env.GCP_PROJECT_NUMBER = "1234567890";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "portal";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = PORTAL_SCHEDULING_SA_EMAIL;
  process.env.GCP_AUDIENCE = "https://vercel.com/billy-kyle";

  const vercelAud = readWorkloadIdentityConfig();
  assert.equal(vercelAud?.oidcAudience, "https://vercel.com/billy-kyle");
  assert.equal(vercelOidcTokenOptions(vercelAud?.oidcAudience ?? ""), undefined);
  assert.equal(
    vercelAud?.stsAudience,
    "//iam.googleapis.com/projects/1234567890/locations/global/workloadIdentityPools/portal/providers/vercel",
  );

  process.env.GCP_AUDIENCE =
    "https://iam.googleapis.com/projects/1234567890/locations/global/workloadIdentityPools/portal/providers/vercel";
  const iamAud = readWorkloadIdentityConfig();
  assert.equal(iamAud?.oidcAudience, process.env.GCP_AUDIENCE);
  assert.equal(
    iamAud?.stsAudience,
    "//iam.googleapis.com/projects/1234567890/locations/global/workloadIdentityPools/portal/providers/vercel",
  );
  assert.deepEqual(vercelOidcTokenOptions(iamAud?.oidcAudience ?? ""), {
    audience: process.env.GCP_AUDIENCE,
  });

  restoreEnv(previous);
});

test("WIF client options impersonate the portal-scheduling SA", () => {
  const audiences = iamProviderAudiences("1234567890", "vercel", "vercel");
  const options = wifClientOptions({
    projectId: GCP_PROJECT_ID_KNOWN,
    projectNumber: "1234567890",
    serviceAccountEmail: PORTAL_SCHEDULING_SA_EMAIL,
    poolId: "vercel",
    providerId: "vercel",
    ...audiences,
  });
  assert.equal(options.type, "external_account");
  assert.equal(options.audience, audiences.stsAudience);
  assert.equal(options.token_url, "https://sts.googleapis.com/v1/token");
  assert.equal(
    options.service_account_impersonation_url,
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${PORTAL_SCHEDULING_SA_EMAIL}:generateAccessToken`,
  );
});

test("malformed GOOGLE_SERVICE_ACCOUNT_JSON does not block WIF", () => {
  const previous = snapshotAuthEnv();
  clearAuthEnv();
  process.env.GOOGLE_CALENDAR_IDS = WORK;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{not-json";
  process.env.GCP_PROJECT_NUMBER = "1234567890";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_ID = "vercel";
  process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID = "vercel";
  process.env.GCP_SERVICE_ACCOUNT_EMAIL = PORTAL_SCHEDULING_SA_EMAIL;
  const creds = readCalendarCredentials();
  assert.equal(creds?.auth.kind, "wif");
  restoreEnv(previous);
});

test("collectFreeBusyIntervals unions both calendars and fails closed", () => {
  const workBusy = { start: "2026-09-21T13:00:00.000Z", end: "2026-09-21T14:00:00.000Z" };
  const personalBusy = { start: "2026-09-21T18:00:00.000Z", end: "2026-09-21T19:00:00.000Z" };
  const blocks = collectFreeBusyIntervals(
    {
      [WORK]: { busy: [workBusy] },
      [PERSONAL]: { busy: [personalBusy] },
    },
    [WORK, PERSONAL],
  );
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.start.toISOString(), workBusy.start);
  assert.equal(blocks[1]?.start.toISOString(), personalBusy.start);

  assert.throws(
    () => collectFreeBusyIntervals({ [WORK]: { busy: [] } }, [WORK, PERSONAL]),
    /bkyle015@gmail.com/,
  );
  assert.throws(
    () =>
      collectFreeBusyIntervals(
        {
          [WORK]: { busy: [] },
          [PERSONAL]: { errors: [{ reason: "notFound" }] },
        },
        [WORK, PERSONAL],
      ),
    /failed for bkyle015@gmail.com/,
  );
});

function restoreEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
