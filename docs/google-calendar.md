# Google Calendar on Vercel (OIDC + Workload Identity Federation)

Production Calendar auth does **not** use a downloadable service-account JSON key. Project `glassy-polymer-509203-r1` (display name **billy-kyle-portal**) enforces `iam.managed.disableServiceAccountKeyCreation`.

The runtime path:

1. Vercel injects a short-lived **Team-issuer** OIDC token (`iss` `https://oidc.vercel.com/billy-kyle`, default `aud` `https://vercel.com/billy-kyle`).
2. The app sends that token to Google STS. STS `audience` is the WIF provider resource (`//iam.googleapis.com/projects/…/providers/vercel`) — that is **not** the OIDC token `aud`.
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
| `GCP_AUDIENCE` | no | **Leave empty** for the production WIF provider (Allowed audiences `https://vercel.com/billy-kyle`). The app uses the default Team-issuer token. Set this only if Flynn switches the provider to GCP **Default audience**, then paste the IAM `https://iam.googleapis.com/projects/199448014322/locations/global/workloadIdentityPools/vercel/providers/vercel` URL. |

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
3. **Audience — use Allowed audiences (this is the production pairing)**
   - **Allowed audiences**: `https://vercel.com/billy-kyle`.  
     Leave `GCP_AUDIENCE` empty. The default Vercel token already has this `aud`; no custom-audience exchange.
   - **Do not** leave the provider on Allowed audiences *and* mint an IAM-provider `aud` (that is `invalid_grant: The audience in ID Token [https://iam.googleapis.com/…] does not match the expected audience`).
   - **Default audience** (optional alternative): GCP generates  
     `https://iam.googleapis.com/projects/199448014322/locations/global/workloadIdentityPools/vercel/providers/vercel`.  
     If Flynn switches to this, set Vercel `GCP_AUDIENCE` to that **same https URL** so `getVercelOidcToken({ audience })` exchanges the Team token.
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

## Flynn checklist (production `invalid_grant` audience)

The portal now matches the Team-issuer + Allowed-audiences pairing. Confirm — do **not** invent a new pool.

| Place | Required value | Action |
| ----- | -------------- | ------ |
| GCP WIF provider issuer | `https://oidc.vercel.com/billy-kyle` | Already set — keep it. |
| GCP WIF provider audience | **Allowed audiences** = `https://vercel.com/billy-kyle` | Already set — keep it. Do not switch to Default audience unless you also set `GCP_AUDIENCE`. |
| Vercel `GCP_AUDIENCE` | empty / unset | Keep empty. Do **not** set the IAM `https://iam.googleapis.com/projects/199448014322/…` URL while Allowed audiences is `https://vercel.com/billy-kyle`. |
| Vercel `GCP_PROJECT_NUMBER` | `199448014322` | Keep. |
| Vercel pool / provider ids | `vercel` / `vercel` | Keep. |

Redeploy after this code change. No GCP console edit is required if the provider already uses Allowed audiences `https://vercel.com/billy-kyle`.
