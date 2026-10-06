# Admin agent connector

Remote MCP server so Cursor / Grok Bot can run Billy's admin tools without a browser session. One API key, installed once.

## Endpoint

Install against the admin host:

```
https://admin.billy-kyle.com/api/agent/mcp
```

The same route is served on `https://portal.billy-kyle.com/api/agent/mcp` (this project does not redirect `/api/agent/mcp`). Prefer the admin host.

Transport: MCP Streamable HTTP, stateless, JSON responses (`@modelcontextprotocol/sdk` `WebStandardStreamableHTTPServerTransport`). POST only. GET and DELETE return 405 so a serverless function does not hold an SSE stream open. Cursor's remote MCP client speaks this transport.

Locally the same path is on `next dev` (`http://127.0.0.1:43173/api/agent/mcp`).

## Auth

Header:

```
Authorization: Bearer <PORTAL_AGENT_API_KEY>
```

`PORTAL_AGENT_API_KEY` is its own secret. It is not `ADMIN_PASSWORD`, not `CRON_SECRET`, and not `JWT_SECRET`. Comparison is constant-time. If the env var is unset, every request is rejected with 401 `Agent API is not configured.` A wrong key is 401 `Unauthorized.`

**Flynn must set `PORTAL_AGENT_API_KEY` on the Vercel project (Production, and Preview if agents should hit preview) before install.** Until that deploy is live, the connector returns 401.

The handler checks the key on every request, applies a light per-isolate rate limit (120 requests / minute / client IP), and logs `agent <tool> ok|error` at info. Logs do not include the key, passwords, or tool arguments.

## Install in Cursor / Grok Bot

Add a remote MCP server. In Cursor that is **AddMcpServer** (or MCP settings) with:

- **url:** `https://admin.billy-kyle.com/api/agent/mcp`
- **headers:** `Authorization: Bearer <the Vercel PORTAL_AGENT_API_KEY>`

Equivalent `mcp.json` entry:

```json
{
  "mcpServers": {
    "atmos-portal": {
      "url": "https://admin.billy-kyle.com/api/agent/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_PORTAL_AGENT_API_KEY"
      }
    }
  }
}
```

No local clone and no stdio process. The portal deployment is the server.

## Tools

| Tool | What it does |
| --- | --- |
| `list_clients` | Invite code, display name, company, primary email, notes summary, user count, shoot count. Optional `query`. Optional `sort`: `code-desc` (highest BK code first), `code-asc` or `code` (BK00001 upward), `name-asc`, `name-desc`, `company` (blank company last), `newest`, `oldest`, `shoots` (most first). Omit `sort` to keep the existing listing order. |
| `get_client` | One client by id or invite code (`BK#####`), including full notes. |
| `create_client` | Create the next BK code. Display name and primary email required. Optional company and notes. |
| `update_client` | Update display name, primary email, company, notes. Omitted fields stay. |
| `delete_client` | **Destructive.** Deletes the client, logins, shoots, and photos. Requires `clientId` and `confirmInviteCode`. |
| `list_client_users` | Teammate logins. No password hashes. |
| `update_client_user` | Name, phone, sign-in email, and the shared client company. Omitted fields stay. |
| `remove_client_user` | **Destructive.** Removes one login. Requires `clientId` and `userId`. The invite stays. |
| `sync_from_nas` | **Start Sync from NAS.** Manual only. Returns immediately with `{ status: "started" \| "already_running", job, recoveredStaleJobId }`. Does not wait for the share walk. `already_running` is the current job, not an error. Same job row as the admin button. No attach-shoot form. |
| `get_nas_sync_status` | Poll one job (`jobId`) or the latest job. `{ job, recoveredStale }`. `job.status` is `running`, `done`, or `failed`. `job.summary` and `job.finishedAt` are set when the walk finishes. `summary` includes clients and shoots added or removed, media counts, and warnings. A running job with no heartbeat for 3 minutes is marked failed (`recoveredStale: true`) so a new sync can start. |
| `list_bookings` | `when` = `upcoming` \| `past` \| `all` (default `all`, cancelled hidden unless `includeCancelled`), optional client id or invite code, `limit` (default 50, max 200). Queued shoots have no start time. They appear in `all`, not in `upcoming` or `past`. |
| `get_booking` | One booking: address, services, times, notes, access codes, calendar id, whether admin can still modify it. |
| `modify_booking` | Admin modify. Omit a field to keep it. A confirmed booking uses the same availability check, save, calendar update, and Shoot-changes email as the admin Bookings form. A future start on a confirmed booking still has to be an offered slot. To schedule a queued shoot, call this same tool with `bookingId` and `startsAt` (ISO, for example `2026-10-13T13:15:00-04:00`). There is no new argument. That path ignores the client slot grid, blocked weekdays, business hours, drive time, and Google Calendar busy time, including Personal calendar blocks. The end is the service length (`endsAt` is ignored). An overlap with another confirmed booking is a warning (`overlapWarning`: `Overlaps an existing booking.` or null), the same as `create_booking`, and the booking is still saved. On success the booking becomes confirmed, the Google Calendar event is created the same way as a normal booking, and the client gets one Shoot confirmed email (addresses in Notes are copied). It does not send “Your shoot is on hold.” and it does not send Billy's New shoot email. |
| `create_booking` | Book a shoot for an existing client at an exact America/New_York date and time. `client` is a client id, an exact display name, or a BK code. Unknown or ambiguous names are rejected with close matches. `date` is `YYYY-MM-DD`. `time` accepts `10`, `10:30`, `10:30am`, `2pm`, `2:15 PM`, or `14:15`. `services` use the same ids as the booking form (`Real Estate · Photography`, `Real Estate · Video`, `Real Estate · Aerial Photos`, `Real Estate · Zillow 360`, `Real Estate · Exterior Only`, `Construction · Photography`, `Construction · Video`, `Podcast · 1 episode`, `Podcast · 2 episodes`, `Commercial video`). `Commercial video` requires `commercialHours`, a whole number from 1 through 8, and that length is what the booking occupies. `Real Estate · Exterior Only` is a fixed 15-minute appointment and can be combined with other Real Estate options. Availability, drive time, and the usual weekday and hour rules are ignored; an overlap is a warning and the booking is still created. Creates the calendar event, sends the client confirmation, and copies addresses in the notes. Does not send Billy's New shoot email. |
| `queue_booking` | Move an existing upcoming confirmed booking into that client's queue. Drops the start and end, deletes the Google Calendar event, and keeps address, services, notes, and access codes. Sends “Your shoot is on hold.” including the previous time, and copies addresses in Notes. Does not email Billy. |
| `create_queued_booking` | Create a queued shoot from scratch for an existing client. Required: `client` (id, exact display name, or BK code), `address`, `services` (same labels as `create_booking`, including Social Media Video and Meeting). Optional: `notes`, and `commercialHours` (1–8) when services include `Commercial video`. No date or time. Inserts `status: queued` with null start and end. No Google Calendar event. Does not send Billy's New shoot email. Sends the client “Your shoot is on hold.” and copies addresses found in Notes. That mail does not mention a previous time, because the shoot was never scheduled. It appears in `list_bookings` with `when=all` (not `upcoming` or `past`) and in the client queue until someone picks a time. Admin Book a shoot still requires a date and time; there is no admin form for this. |
| `cancel_booking` | **Destructive.** Same side effects as the admin UI: status cancelled, calendar event deleted, cancellation emails sent. Requires `bookingId`. |
| `list_client_shoots` | Shoots for a client: date, address, media counts by type, `ready` (imported media exists), public `/s/[token]` URL. |
| `get_shoot` | Metadata plus media inventory (ids and filenames for photos, floor plans, and videos). Not file bytes. |
| `get_shoot_share_link` | Stable public URL on `https://portal.billy-kyle.com/s/[token]`. Does not rotate an existing token. |

`ready` is derived from imported media counts. NAS sync only keeps shoots that have files, and the portal does not store a separate delivery flag for agents to toggle.

NAS sync is manual only. Nothing in the portal walks the share on a timer.

### Sync from NAS

1. Call `sync_from_nas` with no arguments. It returns immediately:
   `{ "status": "started" | "already_running", "job": { "id", "status": "running", ... }, "recoveredStaleJobId": null }`
2. Call `get_nas_sync_status` with `{ "jobId": "<job.id>" }` until `job.status` is `done` or `failed`.
3. On `done`, read `job.finishedAt` and `job.summary` (clients and shoots added or removed, media counts, warnings). On `failed`, read `job.error`.

`already_running` means a walk is in progress. Poll that `job.id`. A crashed run with no heartbeat for 3 minutes is marked failed on the next start or status read (`recoveredStale` / `recoveredStaleJobId`) so a new sync can start.

## Not in this connector

- Mark delivered / delivery tracking
- Attach a shoot from the NAS by hand (use `sync_from_nas`)
- Client-user (non-admin) login
- Password hashes, `JWT_SECRET`, or `ADMIN_PASSWORD`
