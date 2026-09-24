import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CLIENT_SORTS } from "@/lib/admin/client-sort";
import { runAgentTool } from "@/lib/agent/handlers";
import type { AgentOps } from "@/lib/agent/ops";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const destroy = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

async function revalidatePaths(paths: string[]) {
  if (paths.length === 0) return;
  try {
    const { revalidatePath } = await import("next/cache");
    for (const path of paths) revalidatePath(path);
  } catch (error) {
    console.error("agent revalidate failed", error);
  }
}

function toolResult(text: string, isError = false) {
  return {
    isError,
    content: [{ type: "text" as const, text }],
  };
}

export function createPortalMcpServer(ops: AgentOps) {
  const server = new McpServer(
    { name: "atmos-portal", version: "1.0.0" },
    {
      instructions:
        "Admin tools for the Billy Kyle / Atmos client portal. Use the server API key already configured on this connector. Do not ask for the admin password. delete_client, remove_client_user, and cancel_booking are destructive and require explicit ids. Sync from NAS mirrors the share and can remove portal files that are no longer on the NAS. There is no mark-delivered action and no manual attach-shoot action.",
    },
  );

  const register = (
    name: string,
    description: string,
    inputSchema: Record<string, z.ZodTypeAny>,
    annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean; openWorldHint?: boolean },
  ) => {
    server.registerTool(name, { description, inputSchema, annotations }, async (args) => {
      try {
        const result = await runAgentTool(name, args as Record<string, unknown>, ops);
        console.info(`agent ${name} ${result.ok ? "ok" : "error"}`);
        if (!result.ok) return toolResult(result.error, true);
        if (result.revalidate.length > 0) await revalidatePaths(result.revalidate);
        return toolResult(JSON.stringify(result.data, null, 2));
      } catch (error) {
        console.error(`agent ${name} failed`, error);
        console.info(`agent ${name} error`);
        return toolResult("The tool failed.", true);
      }
    });
  };

  register(
    "list_clients",
    "List portal clients. Each row includes invite code, display name, company, primary email, a short notes summary, user count, and shoot count. Optional query and sort. Omit sort to keep the current listing order.",
    {
      query: z.string().optional().describe("Optional case-insensitive match on invite code, name, company, or primary email."),
      sort: z
        .enum(CLIENT_SORTS)
        .optional()
        .describe(
          "Optional. name-asc, name-desc, company (no company last), newest, oldest, shoots (most first), or code (BK00001 upward).",
        ),
    },
    readOnly,
  );
  register(
    "get_client",
    "Get one client by id or invite code (BK#####). Returns the full notes plus user and shoot counts.",
    {
      id: z.string().optional().describe("Client UUID."),
      inviteCode: z.string().optional().describe("Invite code such as BK00004."),
    },
    readOnly,
  );
  register(
    "create_client",
    "Create the next BK invite code. Requires display name and primary email. Company and notes are optional.",
    {
      displayName: z.string().describe("Client display name."),
      primaryEmail: z.string().describe("Primary contact email."),
      company: z.string().nullable().optional().describe("Company. Omit or null to leave empty."),
      notes: z.string().nullable().optional().describe("Internal notes. Omit or null to leave empty."),
    },
    write,
  );
  register(
    "update_client",
    "Update client profile fields. Omitted fields stay as they are. Empty company or notes clears that field.",
    {
      clientId: z.string().describe("Client UUID."),
      displayName: z.string().optional(),
      primaryEmail: z.string().optional(),
      company: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    },
    write,
  );
  register(
    "delete_client",
    "Delete a client and every teammate login, shoot, and photo on that record. Requires the client id and the invite code typed back as confirmInviteCode. Does not remove the NAS folder; the next sync can create a new code for that name.",
    {
      clientId: z.string().describe("Client UUID to delete."),
      confirmInviteCode: z.string().describe("The client's invite code, exactly, for example BK00004."),
    },
    destroy,
  );
  register(
    "list_client_users",
    "List teammate logins on a client. Does not return password hashes.",
    { clientId: z.string().describe("Client UUID.") },
    readOnly,
  );
  register(
    "update_client_user",
    "Update a teammate login. Same fields as Account: first name, last name, phone, sign-in email, and the shared client company. Omitted fields stay as they are. Email is the credentials login.",
    {
      clientId: z.string(),
      userId: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional().describe("Sign-in email."),
      company: z.string().optional().describe("Shared client company."),
    },
    write,
  );
  register(
    "remove_client_user",
    "Remove one teammate login. The client, invite code, and shoots stay. Requires both client id and user id.",
    { clientId: z.string(), userId: z.string() },
    destroy,
  );
  register(
    "sync_from_nas",
    "Run Sync from NAS (the same locked admin sync as the clients page). Returns the sync summary. This can add clients and shoots and remove portal files that are no longer on the share. There is no separate attach-shoot action.",
    {},
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  );
  register(
    "list_bookings",
    "List bookings. Filters: when=upcoming|past|all (default all, cancelled hidden unless includeCancelled), client id or invite code, and limit (default 50, max 200).",
    {
      when: z.enum(["upcoming", "past", "all"]).optional(),
      clientId: z.string().optional(),
      inviteCode: z.string().optional(),
      limit: z.number().int().positive().max(200).optional(),
      includeCancelled: z.boolean().optional(),
    },
    readOnly,
  );
  register(
    "get_booking",
    "Get one booking by id, including address, services, start and end, notes, access codes, and whether admin can still modify it.",
    { bookingId: z.string() },
    readOnly,
  );
  register(
    "modify_booking",
    "Admin modify of a confirmed booking that has not started. Same path as the admin Bookings form: address, services, time, and notes, then the Shoot changes email and calendar update. Omit a field to keep the current value. Services use labels like \"Real Estate · Photography\". startsAt and endsAt are ISO timestamps; omit endsAt to use the offered slot for that start.",
    {
      bookingId: z.string(),
      address: z.string().optional(),
      services: z.array(z.string()).optional(),
      startsAt: z.string().optional().describe("ISO start time."),
      endsAt: z.string().nullable().optional().describe("ISO end time. Must match the offered slot when set."),
      notes: z.string().nullable().optional(),
    },
    write,
  );
  register(
    "create_booking",
    "Book a shoot for an existing client at an exact America/New_York date and time. Ignores availability, the 15-minute grid, business hours, same-day limits, blocked weekdays, and drive time. An overlap is returned as a warning and the booking is still created. Does not send Billy's New shoot email. Still creates the Google Calendar event, sends the client confirmation (with Add to calendar), and copies addresses found in notes. client is a client id, an exact display name, or a BK code such as BK00004. Unknown or ambiguous names are rejected and close matches are listed. date is YYYY-MM-DD. time accepts 10, 10:30, 10:30am, 2pm, 2:15 PM, or 14:15. services are one or more of: Real Estate · Photography, Real Estate · Video, Real Estate · Aerial Photos, Real Estate · Zillow 360, Construction · Photography, Construction · Video, Podcast · 1 episode, Podcast · 2 episodes.",
    {
      client: z.string().describe("Client id, exact display name, or BK code."),
      address: z.string().describe("Full street address."),
      services: z
        .array(z.string())
        .describe(
          "Service ids such as \"Real Estate · Photography\". Podcast episode counts are exclusive.",
        ),
      date: z.string().describe("Shoot date as YYYY-MM-DD."),
      time: z.string().describe("Shoot time in America/New_York, for example 10:30am or 14:15."),
      notes: z.string().optional().describe("Access info, lockbox, or other information. Optional."),
    },
    write,
  );
  register(
    "cancel_booking",
    "Cancel a booking by id. Same side effects as the admin UI: status becomes cancelled, the calendar event is deleted, and the cancellation emails are sent.",
    { bookingId: z.string().describe("Booking UUID to cancel.") },
    destroy,
  );
  register(
    "list_client_shoots",
    "List shoots for a client (id or invite code). Includes address, shot date, media counts by type, ready (has imported media), and the public share URL. Does not return file bytes.",
    {
      clientId: z.string().optional(),
      inviteCode: z.string().optional(),
    },
    readOnly,
  );
  register(
    "get_shoot",
    "Shoot metadata plus a media inventory of ids and filenames for photos, floor plans, and videos. Not the binary files. ready is true when the shoot has imported media.",
    { shootId: z.string() },
    readOnly,
  );
  register(
    "get_shoot_share_link",
    "Return the stable public /s/[token] URL on the client portal. Tokens are created with the shoot; this does not rotate an existing link.",
    { shootId: z.string() },
    readOnly,
  );

  return server;
}
