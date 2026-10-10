# Client agent connector

A client's own AI agent connects here and can act only as that one BK code. It is separate from the admin connector in `docs/agent.md`.

## Endpoint

```
https://portal.billy-kyle.com/api/client/mcp
```

Server name: `billy-kyle-client`. Transport is MCP Streamable HTTP (stateless JSON). Install that production URL. A preview host issues tokens for the preview, not for production.

There is no API key. The client signs in with their portal email and password, picks the BK code when they have more than one, and approves the connection.

## What Billy turns on

Agent access is off for every client until Billy turns it on. On the admin client page, use **Agent access**. The same switch is `set_client_agent_access` on the admin connector (`client` id or BK code, `enabled` true or false). Turning it off revokes that client's tokens immediately.

`list_client_agent_connections` lists who is connected (agent name, approving login, connected time, last used). `revoke_client_agent_connection` drops one connection. `list_clients` and `get_client` include `agentAccess`.

The client sees connected agents on their account page and can disconnect one.

## What the client installs

In their MCP client, add a remote server:

- **url:** `https://portal.billy-kyle.com/api/client/mcp`

The client completes OAuth in the browser: portal sign-in, then a consent screen that names the app and the BK code. No `PORTAL_AGENT_API_KEY`.

Discovery:

- `https://portal.billy-kyle.com/.well-known/oauth-authorization-server`
- `https://portal.billy-kyle.com/.well-known/oauth-protected-resource/api/client/mcp`

PKCE S256 is required. Public clients (`token_endpoint_auth_method: none`) and confidential clients are both accepted. Access tokens last 1 hour. Refresh tokens last 30 days and rotate; reusing an old refresh token revokes the grant.

## Tools

Scoped to the approved BK code. No admin tools, no prices, no other clients.

| Tool | What it does |
| --- | --- |
| `list_my_shoots` / `get_my_shoot` | This client's shoots, including the public share link for delivered files. |
| `list_my_bookings` / `get_my_booking` | This client's bookings. |
| `list_services` | Services that client's category can book. |
| `get_available_slots` | Same slot rules as the client scheduling page. |
| `create_booking` | Books directly. The start must be an offered slot. Notes is the lockbox field. |
| `modify_booking` | Upcoming or queued bookings, same rules as the client form. |
| `cancel_booking` | Upcoming confirmed bookings only. |

Shoot emails for these bookings include one line: "This shoot was booked through an agent." The email does not name the agent.

Each token is limited to 60 calls per minute. Every tool call is written to the activity log on the admin client page.

## Configuration

No new secret. Production still needs the existing `DATABASE_URL`, `JWT_SECRET`, Google Calendar, and Resend settings. Set `PORTAL_PUBLIC_URL` to `https://portal.billy-kyle.com` so share links in tool results use the public portal. The OAuth issuer follows the host the client connects to. Tables are created by `ensureDb` on the first request.
