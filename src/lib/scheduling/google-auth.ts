import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import { SignJWT, importPKCS8 } from "jose";
import { isVercelTeamAudience, type CalendarAuth, type WorkloadIdentityConfig } from "./config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export function wifClientOptions(cfg: WorkloadIdentityConfig) {
  return {
    type: "external_account" as const,
    audience: cfg.stsAudience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt" as const,
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${cfg.serviceAccountEmail}:generateAccessToken`,
  };
}

/**
 * STS `audience` is always the WIF provider resource (`//iam.googleapis.com/…`).
 * The Vercel subject token `aud` is separate: default Team-issuer tokens already
 * have `https://vercel.com/{team}`, which matches GCP Allowed audiences.
 * Passing that URL into getVercelOidcToken would trigger a custom-audience
 * exchange. Only exchange when Flynn set GCP_AUDIENCE to a non-team value
 * (GCP Default audience / IAM provider https URL).
 */
export function vercelOidcTokenOptions(oidcAudience: string) {
  if (!oidcAudience || isVercelTeamAudience(oidcAudience)) return undefined;
  return { audience: oidcAudience };
}

let cachedWif: { key: string; auth: GoogleAuth } | null = null;

function wifCacheKey(cfg: WorkloadIdentityConfig) {
  return [
    cfg.projectNumber,
    cfg.poolId,
    cfg.providerId,
    cfg.serviceAccountEmail,
    cfg.oidcAudience,
    cfg.stsAudience,
    cfg.projectId,
  ].join("|");
}

/**
 * GoogleAuth backed by Vercel OIDC → GCP Workload Identity Federation,
 * impersonating the portal-scheduling service account. No private key.
 */
export async function calendarGoogleAuth(cfg: WorkloadIdentityConfig): Promise<GoogleAuth> {
  const key = wifCacheKey(cfg);
  if (cachedWif?.key === key) return cachedWif.auth;

  const authClient = ExternalAccountClient.fromJSON({
    ...wifClientOptions(cfg),
    subject_token_supplier: {
      getSubjectToken: async () => {
        const oidc = vercelOidcTokenOptions(cfg.oidcAudience);
        return oidc ? getVercelOidcToken(oidc) : getVercelOidcToken();
      },
    },
  });
  if (!authClient) {
    throw new Error("Google Calendar WIF client could not be created from env.");
  }
  authClient.scopes = [CALENDAR_SCOPE];

  const auth = new GoogleAuth({
    authClient,
    projectId: cfg.projectId || undefined,
    scopes: [CALENDAR_SCOPE],
  });
  cachedWif = { key, auth };
  return auth;
}

async function accessTokenFromWif(cfg: WorkloadIdentityConfig) {
  const auth = await calendarGoogleAuth(cfg);
  const client = await auth.getClient();
  const result = await client.getAccessToken();
  const token = typeof result === "string" ? result : result.token;
  if (!token) {
    throw new Error("Google Calendar WIF token response was empty.");
  }
  return token;
}

async function accessTokenFromServiceAccountKey(auth: Extract<CalendarAuth, { kind: "service-account-key" }>) {
  const key = await importPKCS8(auth.privateKey, "RS256");
  const assertion = await new SignJWT({ scope: CALENDAR_SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(auth.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Calendar token ${res.status}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("Google Calendar token response was empty.");
  }
  return body.access_token;
}

export async function getCalendarAccessToken(auth: CalendarAuth) {
  if (auth.kind === "wif") {
    return accessTokenFromWif(auth);
  }
  return accessTokenFromServiceAccountKey(auth);
}
