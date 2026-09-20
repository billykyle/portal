import {
  DEFAULT_CLOSE_HOUR,
  DEFAULT_DAYS_AHEAD,
  DEFAULT_MIN_LEAD_MINUTES,
  DEFAULT_OPEN_HOUR,
  DEFAULT_SLOT_MINUTES,
  DEFAULT_STEP_MINUTES,
  DEFAULT_TIMEZONE,
} from "./rules";

function envInt(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export type SchedulingHours = {
  timeZone: string;
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  stepMinutes: number;
  daysAhead: number;
  minLeadMinutes: number;
};

export function schedulingHours(): SchedulingHours {
  return {
    timeZone: process.env.SCHEDULING_TIMEZONE?.trim() || DEFAULT_TIMEZONE,
    openHour: envInt("SCHEDULING_OPEN_HOUR", DEFAULT_OPEN_HOUR),
    closeHour: envInt("SCHEDULING_CLOSE_HOUR", DEFAULT_CLOSE_HOUR),
    slotMinutes: envInt("SCHEDULING_SLOT_MINUTES", DEFAULT_SLOT_MINUTES),
    stepMinutes: envInt("SCHEDULING_SLOT_STEP_MINUTES", DEFAULT_STEP_MINUTES),
    daysAhead: envInt("SCHEDULING_DAYS_AHEAD", DEFAULT_DAYS_AHEAD),
    minLeadMinutes: envInt("SCHEDULING_MIN_LEAD_MINUTES", DEFAULT_MIN_LEAD_MINUTES),
  };
}

export const WORK_CALENDAR_ID = "billy@atmosimagery.com";
export const PERSONAL_CALENDAR_ID = "bkyle015@gmail.com";

/** Existing Calendar SA. Impersonated via WIF — no downloadable JSON key. */
export const PORTAL_SCHEDULING_SA_EMAIL =
  "portal-scheduling@glassy-polymer-509203-r1.iam.gserviceaccount.com";
export const GCP_PROJECT_ID_KNOWN = "glassy-polymer-509203-r1";

/** Vercel team slug (Team OIDC issuer). Default token `aud` is `https://vercel.com/{slug}`. */
export const VERCEL_TEAM_SLUG_KNOWN = "billy-kyle";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export type WorkloadIdentityConfig = {
  projectId: string;
  projectNumber: string;
  serviceAccountEmail: string;
  poolId: string;
  providerId: string;
  /**
   * Vercel OIDC token `aud`. Default: `https://vercel.com/{team}` (Team issuer).
   * Only exchanged via getVercelOidcToken({ audience }) when this is a custom
   * value such as the IAM provider https URL (GCP Default audience).
   */
  oidcAudience: string;
  /** ExternalAccountClient / STS audience. Always the //iam.googleapis.com/… form. */
  stsAudience: string;
};

export type WorkloadIdentityAuth = WorkloadIdentityConfig & { kind: "wif" };

export type ServiceAccountKeyAuth = {
  kind: "service-account-key";
  clientEmail: string;
  privateKey: string;
};

export type CalendarAuth = WorkloadIdentityAuth | ServiceAccountKeyAuth;

export type CalendarCredentials = {
  calendarIds: string[];
  writeCalendarId: string;
  auth: CalendarAuth;
};

const HOLIDAY_CALENDAR = /#holiday@|holiday@group\.v\.calendar\.google\.com/i;

export function isUsHolidayCalendar(id: string) {
  return HOLIDAY_CALENDAR.test(id.trim());
}

/**
 * Prefer `GOOGLE_CALENDAR_IDS` (comma-separated). Fall back to singular
 * `GOOGLE_CALENDAR_ID`. US Holidays calendars are dropped — never queried.
 */
export function parseCalendarIds(raw: string | string[] | null | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[,;\n]/))
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of parts) {
    if (isUsHolidayCalendar(id)) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  return ids;
}

export function readCalendarIds(): string[] {
  const many = process.env.GOOGLE_CALENDAR_IDS?.trim();
  if (many) return parseCalendarIds(many);
  return parseCalendarIds(process.env.GOOGLE_CALENDAR_ID);
}

export function readServiceAccountEmail() {
  return (
    env("GCP_SERVICE_ACCOUNT_EMAIL") ||
    env("GOOGLE_SERVICE_ACCOUNT_EMAIL") ||
    env("GOOGLE_CLIENT_EMAIL")
  );
}

function isIamProviderAudience(value: string) {
  return /^(https:)?\/\/iam\.googleapis\.com\/projects\/[^/]+\/locations\/global\/workloadIdentityPools\/[^/]+\/providers\/[^/]+$/.test(
    value,
  );
}

export function toStsAudience(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("https://iam.googleapis.com/")) {
    return trimmed.replace("https://", "//");
  }
  return trimmed;
}

export function iamProviderAudiences(projectNumber: string, poolId: string, providerId: string) {
  const path = `iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;
  return {
    oidcAudience: `https://${path}`,
    stsAudience: `//${path}`,
  };
}

export function vercelTeamOidcAudience(teamSlug: string) {
  return `https://vercel.com/${teamSlug}`;
}

export function vercelTeamOidcIssuer(teamSlug: string) {
  return `https://oidc.vercel.com/${teamSlug}`;
}

export function isVercelTeamAudience(value: string) {
  return /^https:\/\/vercel\.com\/[^/]+$/.test(value.trim());
}

export function teamSlugFromOidcIssuer(issuer: string) {
  const match = issuer.trim().match(/^https:\/\/oidc\.vercel\.com\/([^/]+)$/);
  return match?.[1] ?? null;
}

/** Read `iss` / `aud` from a Vercel OIDC JWT without verifying the signature. */
export function teamSlugFromOidcToken(token: string) {
  const payload = token.trim().split(".")[1];
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const claims = JSON.parse(json) as { iss?: unknown; aud?: unknown };
    if (typeof claims.iss === "string") {
      const fromIssuer = teamSlugFromOidcIssuer(claims.iss);
      if (fromIssuer) return fromIssuer;
    }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    for (const value of audiences) {
      if (typeof value !== "string") continue;
      const match = value.trim().match(/^https:\/\/vercel\.com\/([^/]+)$/);
      if (match?.[1]) return match[1];
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Team slug for the default Vercel OIDC audience.
 * Prefers an explicit slug, then the injected token's issuer/aud, then billy-kyle.
 */
export function readVercelTeamSlug() {
  const explicit = env("VERCEL_OIDC_TEAM_SLUG") || env("GCP_OIDC_TEAM_SLUG");
  if (explicit) return explicit;
  return teamSlugFromOidcToken(env("VERCEL_OIDC_TOKEN")) || VERCEL_TEAM_SLUG_KNOWN;
}

/**
 * Vercel OIDC → GCP Workload Identity Federation.
 *
 * Required:
 * - `GCP_PROJECT_NUMBER`
 * - `GCP_WORKLOAD_IDENTITY_POOL_ID`
 * - `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`
 * - `GCP_SERVICE_ACCOUNT_EMAIL` or `GOOGLE_SERVICE_ACCOUNT_EMAIL`
 *
 * Optional:
 * - `GCP_PROJECT_ID` (display / GoogleAuth project)
 * - `GCP_AUDIENCE` — custom OIDC token `aud`. Leave empty when the WIF
 *   provider uses **Allowed audiences** `https://vercel.com/[TEAM]` (the
 *   Team-issuer default token). Set to the IAM provider https URL only if
 *   the provider uses GCP **Default audience**.
 */
export function readWorkloadIdentityConfig(): WorkloadIdentityConfig | null {
  const projectNumber = env("GCP_PROJECT_NUMBER");
  const poolId = env("GCP_WORKLOAD_IDENTITY_POOL_ID") || env("GOOGLE_WORKLOAD_IDENTITY_POOL_ID");
  const providerId =
    env("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID") || env("GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
  const serviceAccountEmail = readServiceAccountEmail();
  if (!projectNumber || !poolId || !providerId || !serviceAccountEmail.includes("@")) {
    return null;
  }

  const constructed = iamProviderAudiences(projectNumber, poolId, providerId);
  const audienceOverride = env("GCP_AUDIENCE");
  const oidcAudience = audienceOverride || vercelTeamOidcAudience(readVercelTeamSlug());
  const stsAudience =
    audienceOverride && isIamProviderAudience(audienceOverride)
      ? toStsAudience(audienceOverride)
      : constructed.stsAudience;

  return {
    projectId: env("GCP_PROJECT_ID") || env("GOOGLE_CLOUD_PROJECT"),
    projectNumber,
    serviceAccountEmail,
    poolId,
    providerId,
    oidcAudience,
    stsAudience,
  };
}

/**
 * Local/dev fallback. Production should not use a downloadable SA JSON key
 * (`iam.managed.disableServiceAccountKeyCreation` is enforced).
 */
export function readServiceAccountKey(): ServiceAccountKeyAuth | null {
  let clientEmail = readServiceAccountEmail();
  let privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim();

  const json = env("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        type?: string;
        client_email?: string;
        private_key?: string;
      };
      if (parsed.type === "external_account") {
        // WIF JSON is not a private key. Ignore it here.
      } else if (parsed.private_key || parsed.client_email) {
        clientEmail = clientEmail || String(parsed.client_email ?? "").trim();
        privateKey = privateKey || String(parsed.private_key ?? "").replace(/\\n/g, "\n").trim();
      }
    } catch {
      // Malformed JSON must not block the WIF path.
    }
  }

  if (!clientEmail.includes("@") || !privateKey.includes("BEGIN")) return null;
  return { kind: "service-account-key", clientEmail, privateKey };
}

/**
 * Prefer WIF on Vercel (or whenever a Vercel OIDC token is present).
 * Fall back to a PKCS8 key for local/dev.
 */
export function readCalendarAuth(): CalendarAuth | null {
  const wif = readWorkloadIdentityConfig();
  const key = readServiceAccountKey();
  const onVercel = Boolean(env("VERCEL"));
  const hasOidc = Boolean(env("VERCEL_OIDC_TOKEN"));

  if (wif && (onVercel || hasOidc || !key)) {
    return { kind: "wif", ...wif };
  }
  if (key) return key;
  if (wif) return { kind: "wif", ...wif };
  return null;
}

/**
 * Env hooks for Google Calendar (read free/busy + write events).
 *
 * Required together:
 * - `GOOGLE_CALENDAR_IDS` = `billy@atmosimagery.com,bkyle015@gmail.com`
 *   (work + personal). A slot is busy if either calendar is busy.
 *   Singular `GOOGLE_CALENDAR_ID` still works as a fallback.
 *   Do not include US Holidays.
 * - Production auth: Vercel OIDC + GCP WIF impersonating
 *   `portal-scheduling@…` (`GCP_PROJECT_NUMBER`, pool/provider IDs,
 *   `GCP_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_EMAIL`).
 * - Local/dev fallback: `GOOGLE_SERVICE_ACCOUNT_JSON` or
 *   `GOOGLE_CLIENT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`.
 *
 * Bookings are written to the first ID (work). Both calendars must be shared
 * with the service-account email.
 */
export function readCalendarCredentials(): CalendarCredentials | null {
  const calendarIds = readCalendarIds();
  if (calendarIds.length === 0) return null;
  const writeCalendarId = calendarIds[0];
  if (!writeCalendarId) return null;
  const auth = readCalendarAuth();
  if (!auth) return null;
  return { calendarIds, writeCalendarId, auth };
}

export function calendarConfigured() {
  return readCalendarCredentials() != null;
}

/**
 * Env hook for Maps (server-only). One key covers:
 * - Distance Matrix — live drive time
 * - Places Autocomplete + Place Details — book-form suggestions
 * - Address Validation — format a typed address when no suggestion was picked
 *
 * Empty = do not invent travel or addresses. The book form shows a clear
 * message instead of fake suggestions; slots that need travel are refused.
 */
export function mapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
}

export function driveTimeConfigured() {
  return Boolean(mapsApiKey());
}

export function placesConfigured() {
  return Boolean(mapsApiKey());
}

export type SchedulingIntegrations = {
  calendarConfigured: boolean;
  driveTimeConfigured: boolean;
  placesConfigured: boolean;
};

export function schedulingIntegrations(): SchedulingIntegrations {
  return {
    calendarConfigured: calendarConfigured(),
    driveTimeConfigured: driveTimeConfigured(),
    placesConfigured: placesConfigured(),
  };
}
