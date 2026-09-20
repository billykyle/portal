# Google Calendar on Vercel (OIDC + Workload Identity Federation)

Production Calendar auth does **not** use a downloadable service-account JSON key. Project `glassy-polymer-509203-r1` (display name **billy-kyle-portal**) enforces `iam.managed.disableServiceAccountKeyCreation`.

The runtime path:

1. Vercel injects a short-lived OIDC token (`getVercelOidcToken` from `@vercel/oidc`).
2. Google STS exchanges that token via Workload Identity Federation.
3. The federation impersonates `portal-scheduling@glassy-polymer-509203-r1.iam.gserviceaccount.com`.
4. That SA calls Calendar `freeBusy` (work + personal) and writes bookings to the first ID (work).

Maps stays on `GOOGLE_MAPS_API_KEY`. Do not reuse it for Calendar.

Official Vercel guide: [Connect to Google Cloud Platform (GCP)](https://vercel.com/docs/oidc/gcp).

## Env vars the app reads

Set these on the Vercel project (Production + Preview). Flynn creates the WIF pool/provider in the GCP console and pastes the IDs.

| Variable | Required in prod | Example / notes |
| -------- | ---------------- | --------------- |
| `GOOGLE_CALENDAR_IDS` | yes (for live availability) | `billy@atmosimagery.com,bkyle015@gmail.com` |
| `GCP_PROJECT_ID` | no | `glassy-polymer-509203-r1` |
| `GCP_PROJECT_NUMBER` | yes | Numeric id from **IAM & Admin → Settings** |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | yes | Pool id, e.g. `vercel` |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | yes | Provider id, e.g. `vercel` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | yes | `portal-scheduling@glassy-polymer-509203-r1.iam.gserviceaccount.com` (alias: `GOOGLE_SERVICE_ACCOUNT_EMAIL`) |
| `GCP_AUDIENCE` | no | Empty = IAM provider `https://iam.googleapis.com/projects/…/providers/…` (GCP **Default audience**). If the provider uses **Allowed audiences**, set `https://vercel.com/billy-kyle`. |

Aliases also accepted: `GOOGLE_WORKLOAD_IDENTITY_POOL_ID`, `GOOGLE_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`.

Local/dev fallback (not for production): `GOOGLE_SERVICE_ACCOUNT_JSON`, or `GOOGLE_CLIENT_EMAIL` + `GOOGLE_PRIVATE_KEY`. On Vercel, WIF wins when both are present.

## GCP console (Flynn)

Use the existing SA. Do not create a JSON key.

1. **IAM & Admin → Workload Identity Federation → Create Pool**  
   Name/id example: `Vercel` / `vercel`.
2. **Add provider → OpenID Connect (OIDC)**  
   Name/id example: `Vercel` / `vercel`.  
   Issuer (team mode): `https://oidc.vercel.com/billy-kyle`  
   Leave the JWK file empty.
3. **Audience**
   - **Default audience** (recommended): copy the generated  
     `https://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`  
     Leave `GCP_AUDIENCE` empty in Vercel (the app mints that `aud`).
   - **Allowed audiences**: `https://vercel.com/billy-kyle`, and set `GCP_AUDIENCE` to that same URL.
4. Attribute mapping: `google.subject` → `assertion.sub`. Save.
5. Grant the Vercel principal permission to impersonate the existing SA  
   (`roles/iam.workloadIdentityUser` on `portal-scheduling@…`).  
   Subject shape from Vercel:

   `owner:billy-kyle:project:<vercel-project-name>:environment:production`  
   (add Preview / Development principals the same way).

   Full principal:

   `principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/subject/owner:billy-kyle:project:<vercel-project-name>:environment:production`
6. Enable **IAM Service Account Credentials API** and **Security Token Service API** if they are off.
7. In Google Calendar, share **both** calendars with `portal-scheduling@glassy-polymer-509203-r1.iam.gserviceaccount.com` (Make changes to events on work so bookings can be written). Do not share US Holidays.

OIDC is automatic on Vercel. Locally, `vercel env pull` writes a `VERCEL_OIDC_TOKEN` (~12h) if you want to exercise WIF without a private key.
