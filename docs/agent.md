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
| `list_clients` | Invite code, display name, company, primary email, notes summary, user count, shoot count. Optional `query`. Optional `sort`: `name-asc`, `name-desc`, `company` (blank company last), `newest`, `oldest`, `shoots` (most first), `code` (BK00001 upward). Omit `sort` to keep the existing listing order. |
| `get_client` | One client by id or invite code (`BK#####`), including full notes. |
| `create_client` | Create the next BK code. Display name and primary email required. Optional company and notes. |
| `update_client` | Update display name, primary email, company, notes. Omitted fields stay. |
| `delete_client` | **Destructive.** Deletes the client, logins, shoots, and photos. Requires `clientId` and `confirmInviteCode`. |
| `list_client_users` | Teammate logins. No password hashes. |
| `update_client_user` | Name, phone, sign-in email, and the shared client company. Omitted fields stay. |
| `remove_client_user` | **Destructive.** Removes one login. Requires `clientId` and `userId`. The invite stays. |
| `sync_from_nas` | **Sync from NAS.** Same `runLockedNasSync("admin")` path as the admin button. Returns the sync summary. No attach-shoot form. |
| `list_bookings` | `when` = `upcoming` \| `past` \| `all` (default `all`, cancelled hidden unless `includeCancelled`), optional client id or invite code, `limit` (default 50, max 200). |
| `get_booking` | One booking: address, services, times, notes, access codes, calendar id, whether admin can still modify it. |
| `modify_booking` | Admin modify. Same availability check, save, calendar update, and Shoot-changes email as the admin Bookings form. Omit a field to keep it. |
| `create_booking` | Book a shoot for an existing client at an exact America/New_York date and time. `client` is a client id, an exact display name, or a BK code. Unknown or ambiguous names are rejected with close matches. `date` is `YYYY-MM-DD`. `time` accepts `10`, `10:30`, `10:30am`, `2pm`, `2:15 PM`, or `14:15`. `services` use the same ids as the booking form (`Real Estate · Photography`, `Real Estate · Video`, `Real Estate · Aerial Photos`, `Real Estate · Zillow 360`, `Construction · Photography`, `Construction · Video`, `Podcast · 1 episode`, `Podcast · 2 episodes`). Availability, drive time, and the usual weekday and hour rules are ignored; an overlap is a warning and the booking is still created. Creates the calendar event, sends the client confirmation, and copies addresses in the notes. Does not send Billy's New shoot email. |
| `cancel_booking` | **Destructive.** Same side effects as the admin UI: status cancelled, calendar event deleted, cancellation emails sent. Requires `bookingId`. |
| `list_client_shoots` | Shoots for a client: date, address, media counts by type, `ready` (imported media exists), public `/s/[token]` URL. |
| `get_shoot` | Metadata plus media inventory (ids and filenames for photos, floor plans, and videos). Not file bytes. |
| `get_shoot_share_link` | Stable public URL on `https://portal.billy-kyle.com/s/[token]`. Does not rotate an existing token. |

`ready` is derived from imported media counts. NAS sync only keeps shoots that have files, and the portal does not store a separate delivery flag for agents to toggle.

## Not in this connector

- Mark delivered / delivery tracking
- Attach a shoot from the NAS by hand (use `sync_from_nas`)
- Client-user (non-admin) login
- Password hashes, `JWT_SECRET`, or `ADMIN_PASSWORD`
