import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AGENT_CLIENT_SORTS } from "@/lib/admin/client-sort";
import { runAgentTool } from "@/lib/agent/handlers";
import type { AgentOps } from "@/lib/agent/ops";
import { CLIENT_CATEGORIES } from "@/lib/client-category";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const destroy = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

async function revalidatePaths(paths: string[]) {
  if (paths.length === 0) return;
  try {
    const { revalidatePath } = await import("next/cache");
    for (const path of paths) {
      if (path === "/") revalidatePath(path, "layout");
      else revalidatePath(path);
    }
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
        "Admin tools for the Billy Kyle / Atmos client portal. Use the server API key already configured on this connector. Do not ask for the admin password. delete_client, remove_client_user, and cancel_booking are destructive and require explicit ids. queue_booking moves an upcoming booking into the client queue, drops the start time, deletes the Google Calendar event, and emails every signed-up user on the client plus the real primary contact. It does not email Billy. create_queued_booking creates a new queued shoot for an existing client with no start time and no Google Calendar event. It emails every signed-up user on the client plus the real primary contact “Your shoot is on hold.” and includes addresses in Notes on that same To list. The booking contact is the client's primary contact, not the newest login. It does not email Billy. To put that queued shoot on the calendar, call modify_booking with its bookingId and startsAt. create_booking and modify_booking, including a booking that is already confirmed, do not use the client slot grid. Free/busy on Work or Personal, overlaps with other bookings, drive buffers, business hours, weekdays, category restrictions, the one-Twilight-per-day rule, and the Twilight sunset time do not reject the save. An overlap is returned as overlapWarning and in warnings, and the booking is still confirmed. A second Twilight that day is a warning in warnings, not an error. Twilight may be combined with other services on create_booking and modify_booking. Omit time on a Twilight create to use that day's Philadelphia sunset, or pass any explicit time. The save creates the Work calendar event for the primary contact and sends the normal shoot email to every signed-up user on the client, the real primary contact, and Notes addresses. Scheduling a queued shoot sends one Shoot confirmed email and does not send another on-hold email. Sync from NAS is manual only: call sync_from_nas to start, then get_nas_sync_status until the job is done or failed. It mirrors the share and can remove portal files that are no longer on the NAS. There is no automatic sync. There is no mark-delivered action and no manual attach-shoot action. set_client_agent_access turns Agent access on or off for one client (id or BK code). Turning it off revokes that client's tokens immediately. list_client_agent_connections lists connected agents with the approving login, connected time, and last used time. revoke_client_agent_connection revokes one connection by token id. list_clients and get_client include agentAccess.",
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
    "List portal clients. Each row includes invite code, display name, company, primary email, category, agentAccess, a short notes summary, user count, and shoot count. Optional query, sort, and category. Omit sort to keep the current listing order.",
    {
      query: z.string().optional().describe("Optional case-insensitive match on invite code, name, company, or primary email."),
      sort: z
        .enum(AGENT_CLIENT_SORTS)
        .optional()
        .describe(
          "Optional. code-desc (highest BK code first), code-asc or code (BK00001 upward), name-asc, name-desc, company (no company last), newest, oldest, or shoots (most first).",
        ),
      category: z
        .enum(CLIENT_CATEGORIES)
        .optional()
        .describe("Optional filter: real_estate, construction, podcast, other, or commercial."),
    },
    readOnly,
  );
  register(
    "get_client",
    "Get one client by id or invite code (BK#####). Returns the full notes, agentAccess, plus user and shoot counts.",
    {
      id: z.string().optional().describe("Client UUID."),
      inviteCode: z.string().optional().describe("Invite code such as BK00004."),
    },
    readOnly,
  );
  register(
    "create_client",
    "Create the next BK invite code. Requires display name and primary email. Company, notes, and category are optional. Category defaults to other.",
    {
      displayName: z.string().describe("Client display name."),
      primaryEmail: z.string().describe("Primary contact email."),
      company: z.string().nullable().optional().describe("Company. Omit or null to leave empty."),
      notes: z.string().nullable().optional().describe("Internal notes. Omit or null to leave empty."),
      category: z
        .enum(CLIENT_CATEGORIES)
        .optional()
        .describe("real_estate, construction, podcast, other, or commercial. Omit to use other."),
    },
    write,
  );
  register(
    "update_client",
    "Update client profile fields. Omitted fields stay as they are. Empty company or notes clears that field. Omit category to leave it unchanged.",
    {
      clientId: z.string().describe("Client UUID."),
      displayName: z.string().optional(),
      primaryEmail: z.string().optional(),
      company: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      category: z
        .enum(CLIENT_CATEGORIES)
        .optional()
        .describe("real_estate, construction, podcast, other, or commercial."),
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
    "List teammate logins on a client, including people attached with an extra BK code. Does not return password hashes.",
    { clientId: z.string().describe("Client UUID.") },
    readOnly,
  );
  register(
    "update_client_user",
    "Update a teammate login. Same fields as Account: first name, last name, phone, sign-in email, and the shared client company. Omitted fields stay as they are. Email is the credentials login. addInviteCode attaches another BK code to this same login so they can open that client too.",
    {
      clientId: z.string(),
      userId: z.string(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional().describe("Sign-in email."),
      company: z.string().optional().describe("Shared client company."),
      addInviteCode: z
        .string()
        .optional()
        .describe("Another BK code to attach to this login. Does not create a second account."),
    },
    write,
  );
  register(
    "remove_client_user",
    "Remove one teammate from a client. If they signed up on this client, the login is deleted. If they were only attached with an extra BK code, that code is dropped and the login stays. The client, invite code, and shoots stay. Requires both client id and user id.",
    { clientId: z.string(), userId: z.string() },
    destroy,
  );
  register(
    "sync_from_nas",
    "Start a manual Sync from NAS and return immediately. Does not wait for the share walk. Same job as the admin Sync from NAS button. Response: { status: \"started\" | \"already_running\", job, recoveredStaleJobId }. status \"started\" means this call claimed the walk. status \"already_running\" means a walk is already in progress; job is that walk so you can poll it (this is not an error). recoveredStaleJobId is set when a crashed run's lock was cleared so this start could proceed. job is { id, status: \"running\" | \"done\" | \"failed\", source, phase, detail, clientsSeen, shootsSeen, startedAt, updatedAt, finishedAt, error, summary }. summary is null until the walk finishes. A finished summary has skipped, reason, clientsCreated, clientsReused, shootsCreated, shootsReused, mediaImported, mediaUpdated, mediaRemoved, shootsRemoved, ready, and warnings. Poll get_nas_sync_status with job.id until job.status is done or failed. finishedAt is set when the walk finishes. A running job with no heartbeat for 3 minutes is a stale lock and is marked failed so a new sync can start. Manual only: nothing syncs on a timer. This can add clients and shoots and remove portal files that are no longer on the share. There is no separate attach-shoot action.",
    {},
    { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  );
  register(
    "get_nas_sync_status",
    "Read one NAS sync job, or the latest job when jobId is omitted. Response: { job, recoveredStale }. job is null when nothing has been started. Otherwise job matches sync_from_nas: { id, status: \"running\" | \"done\" | \"failed\", source, phase, detail, clientsSeen, shootsSeen, startedAt, updatedAt, finishedAt, error, summary }. Poll until status is done or failed. summary is present when the walk finished and includes clients/shoots added and removed, media counts, and warnings. error is set when status is failed. finishedAt is set when the walk finishes. recoveredStale is true when this read found a crashed lock (no heartbeat for 3 minutes) and marked that job failed so a new sync_from_nas can start. An unknown jobId is an error.",
    {
      jobId: z
        .string()
        .optional()
        .describe("Job id returned by sync_from_nas. Omit to read the latest job."),
    },
    readOnly,
  );
  register(
    "list_bookings",
    "List bookings. Filters: when=upcoming|past|all (default all, cancelled hidden unless includeCancelled), client id or invite code, and limit (default 50, max 200). Queued shoots have no start time. They appear in all, not in upcoming or past.",
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
    "Admin modify of a booking, including one that has already started and one that is already confirmed. Omit a field to keep the current value. Services use labels like \"Real Estate · Photography\", \"Real Estate · Exterior Only\", \"Real Estate · Twilight\", or \"Commercial video\". Commercial video needs commercialHours from 1 through 8; omit it to keep the saved length. Twilight may be combined with other services in this one booking. startsAt and endsAt are ISO timestamps. endsAt is ignored. The end is the service length. This does not use the client slot grid for a queued booking or a confirmed booking. Free/busy on Work or Personal (including Personal calendar blocks), overlaps with other confirmed bookings, drive buffers, business hours, blocked weekdays, category restrictions, the one-Twilight-per-day rule, and whether the time is the Philadelphia sunset do not reject the save. A past or future startsAt is saved even when it is not an offered slot. An overlap is a warning (overlapWarning is \"Overlaps an existing booking.\" or null) and is also listed in warnings. A second Twilight on that Eastern day is a warning in warnings (\"That day already has a Twilight booking.\"), not an error. The booking is still saved. A confirmed booking gets the Shoot changes email and a Work calendar update. To schedule a queued booking, pass its bookingId and startsAt. No extra argument. Success sets status confirmed, creates the Google Calendar event for the primary contact, and sends one Shoot confirmed email to every signed-up user on the client, the real primary contact, and Notes addresses. It does not send another on-hold email and it does not email Billy.",
    {
      bookingId: z.string(),
      address: z.string().optional(),
      services: z.array(z.string()).optional(),
      commercialHours: z
        .number()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe("Whole hours for Commercial video, from 1 through 8."),
      startsAt: z.string().optional().describe("ISO start time."),
      endsAt: z
        .string()
        .nullable()
        .optional()
        .describe("ISO end time. Ignored. The end is always the service length."),
      notes: z.string().nullable().optional(),
    },
    write,
  );
  register(
    "queue_booking",
    "Move an existing upcoming booking into that client's queue. Drops the start and end time, deletes the Google Calendar event, and keeps the address, services, notes, and access codes so the client can pick a new time later. Sends “Your shoot is on hold.” to every signed-up user on the client, the real primary contact, and addresses found in Notes, in one To list. Does not email Billy. Only an upcoming confirmed booking can be queued.",
    { bookingId: z.string().describe("Booking UUID to queue.") },
    write,
  );
  register(
    "create_queued_booking",
    "Create a queued shoot for an existing client with no start or end time. The client picks a time later. client is a client id, an exact display name, or a BK code such as BK00004. Unknown or ambiguous names are rejected and close matches are listed. address is the full street address. services use the same labels as create_booking: Real Estate · Photography, Real Estate · Video, Real Estate · Aerial Photos, Real Estate · Twilight, Real Estate · Zillow 360, Real Estate · Exterior Only, Construction · Photography, Construction · Video, Podcast · 1 episode, Podcast · 2 episodes, Commercial video, Social Media Video · Monthly Batch Video, Social Media Video · Long Form Content Creation, Meeting · 30 min appointment, Meeting · 1 hour appointment. Commercial video requires commercialHours, a whole number from 1 through 8. Podcast, Social Media Video, and Meeting options are exclusive within each group. Real Estate · Twilight cannot be combined with other services. notes is optional. Does not create a Google Calendar event and does not send Billy's New shoot email. Attaches the booking to the client's primary contact, not the newest login. Sends “Your shoot is on hold.” (this shoot is waiting in the queue; the message does not mention a previous time) to every signed-up user on the client, the real primary contact, and addresses found in Notes, in one To list. The shoot shows in list_bookings when=all, and in the client queue, until someone schedules it. This is not queue_booking, which only moves an existing upcoming booking.",
    {
      client: z.string().describe("Client id, exact display name, or BK code."),
      address: z.string().describe("Full street address."),
      services: z
        .array(z.string())
        .describe(
          "Service ids such as \"Real Estate · Photography\", \"Real Estate · Twilight\", or \"Commercial video\". Same labels as create_booking. Podcast, Social Media Video, and Meeting options are exclusive within each group. Twilight cannot be combined with other services.",
        ),
      commercialHours: z
        .number()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe("Required when services include Commercial video. Whole hours from 1 through 8."),
      notes: z.string().optional().describe("Access info, lockbox, or other information. Optional. Addresses here are copied on the hold email."),
    },
    write,
  );
  register(
    "create_booking",
    "Book a shoot for an existing client at an exact America/New_York date and time. Overlaps are allowed. Free/busy on Work or Personal, overlaps with other confirmed bookings, the 15-minute grid, drive buffers, business hours, same-day limits, blocked weekdays, category restrictions, the one-Twilight-per-day rule, and the Twilight sunset time do not reject the save. A start that is already in the past, including earlier today, is allowed. An overlap is returned as overlapWarning (\"Overlaps an existing booking.\" or null) and in warnings, and the booking is still created. A second Twilight on that Eastern day is a warning in warnings, not an error. Does not send Billy's New shoot email. Still creates the Work calendar event using the client's primary contact (not the newest login), and sends one confirmation (with Add to calendar) to every signed-up user on the client, the real primary contact, and addresses found in notes. client is a client id, an exact display name, or a BK code such as BK00004. Unknown or ambiguous names are rejected and close matches are listed. date is YYYY-MM-DD. time accepts 10, 10:30, 10:30am, 2pm, 2:15 PM, or 14:15. services are one or more of: Real Estate · Photography, Real Estate · Video, Real Estate · Aerial Photos, Real Estate · Twilight, Real Estate · Zillow 360, Real Estate · Exterior Only, Construction · Photography, Construction · Video, Podcast · 1 episode, Podcast · 2 episodes, Commercial video, Social Media Video · Monthly Batch Video, Social Media Video · Long Form Content Creation, Meeting · 30 min appointment, Meeting · 1 hour appointment. Commercial video requires commercialHours, a whole number from 1 through 8. That length is what the booking occupies. Podcast episode counts are exclusive. Social Media Video options are exclusive: Monthly Batch Video is 60 minutes and Long Form Content Creation is 120 minutes. Meeting lengths are exclusive: 30 min appointment is 30 minutes and 1 hour appointment is 60 minutes. Real Estate · Exterior Only is a 15-minute appointment and can be combined with other Real Estate options. Real Estate · Twilight is a 30-minute appointment and can be combined with other services in this one booking; the minutes are summed. Omit time when Twilight is included to start at that day's Philadelphia sunset, rounded down to the previous 15 minutes; a time you pass is accepted even when it is not sunset. Category service limits do not apply.",
    {
      client: z.string().describe("Client id, exact display name, or BK code."),
      address: z.string().describe("Full street address."),
      services: z
        .array(z.string())
        .describe(
          "Service ids such as \"Real Estate · Photography\", \"Real Estate · Twilight\", or \"Commercial video\". Podcast, Social Media Video, and Meeting options are exclusive within each group. Twilight can be combined with other services.",
        ),
      commercialHours: z
        .number()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe("Required when services include Commercial video. Whole hours from 1 through 8."),
      date: z.string().describe("Shoot date as YYYY-MM-DD."),
      time: z
        .string()
        .optional()
        .describe(
          "America/New_York time, for example 10:30am or 14:15. Required except for Real Estate · Twilight, which defaults to that day's Philadelphia sunset slot.",
        ),
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
    "List shoots for a client (id or invite code). Includes address, shot date, categoryFolder (the NAS folder name when the shoot is grouped, otherwise null), media counts by type, ready (has imported media), portalUrl (signed-in /my-content/[slug]), and the public share URL. Does not return file bytes.",
    {
      clientId: z.string().optional(),
      inviteCode: z.string().optional(),
    },
    readOnly,
  );
  register(
    "get_shoot",
    "Shoot metadata plus a media inventory of ids and filenames for photos, floor plans, finished video, and raw video. Not the binary files. categoryFolder is the NAS folder name when the shoot is grouped, otherwise null. ready is true when the shoot has imported media. portalUrl is the signed-in /my-content/[slug] page; publicUrl stays the share link.",
    { shootId: z.string() },
    readOnly,
  );
  register(
    "get_maintenance_notice",
    "Read the saved portal maintenance notice. notice is null when nothing is saved. live is true only while now is inside the window. Does not email anyone.",
    {},
    readOnly,
  );
  register(
    "set_maintenance_notice",
    "Save one maintenance notice, or clear it. message, startsAt, and endsAt (ISO times) are required unless clear is true. Does not email clients. The banner shows only while now is inside the window.",
    {
      message: z.string().optional(),
      startsAt: z.string().optional().describe("ISO start time."),
      endsAt: z.string().optional().describe("ISO end time."),
      clear: z.boolean().optional().describe("Delete the saved notice."),
    },
    write,
  );
  register(
    "set_client_agent_access",
    "Turn Agent access on or off for one client. Pass a client id or BK code as client, or pass clientId and/or inviteCode. enabled must be true or false. Turning it off revokes every token for that client immediately, so connected agents stop working on the next call.",
    {
      client: z.string().optional().describe("Client UUID or BK code such as BK00004."),
      clientId: z.string().optional().describe("Client UUID. Use with or instead of client."),
      inviteCode: z.string().optional().describe("BK code. Use with or instead of client."),
      enabled: z.boolean().describe("true allows new and existing agent connections. false revokes that client's tokens."),
    },
    write,
  );
  register(
    "list_client_agent_connections",
    "List connected agents for one client (id or BK code). Each row has tokenId, agentName (the OAuth client name from registration), approvedBy (the login that approved the connection), connectedAt, and lastUsedAt.",
    {
      client: z.string().optional().describe("Client UUID or BK code such as BK00004."),
      clientId: z.string().optional(),
      inviteCode: z.string().optional(),
    },
    readOnly,
  );
  register(
    "revoke_client_agent_connection",
    "Revoke one connected agent for a client. Requires the client (id or BK code) and tokenId from list_client_agent_connections. Does not change the Agent access toggle.",
    {
      client: z.string().optional().describe("Client UUID or BK code such as BK00004."),
      clientId: z.string().optional(),
      inviteCode: z.string().optional(),
      tokenId: z.string().describe("Token id from list_client_agent_connections."),
    },
    destroy,
  );
  register(
    "get_shoot_share_link",
    "Return the stable public /s/[token] URL on the client portal. Tokens are created with the shoot; this does not rotate an existing link. portalUrl is the signed-in My Content slug page and is not a substitute for the share link.",
    { shootId: z.string() },
    readOnly,
  );

  return server;
}
