import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ClientAgentContext } from "@/lib/client-agent/access";
import { runClientTool, type ClientAgentOps } from "@/lib/client-agent/handlers";
import { revalidateAdminHome } from "@/lib/revalidate-admin-home";

const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const destroy = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

const serviceHelp =
  "Service ids from list_services for this client's category. Same labels as the portal booking form, such as Real Estate · Photography. No prices.";

async function revalidatePaths(paths: string[]) {
  if (paths.length === 0) return;
  try {
    const { revalidatePath } = await import("next/cache");
    for (const path of paths) revalidatePath(path);
    if (paths.includes("/admin/bookings")) revalidateAdminHome();
  } catch (error) {
    console.error("client-agent revalidate failed", error);
  }
}

function toolResult(text: string, isError = false) {
  return { isError, content: [{ type: "text" as const, text }] };
}

export function createClientMcpServer(ctx: ClientAgentContext, ops: ClientAgentOps) {
  const server = new McpServer(
    { name: "billy-kyle-client", version: "1.0.0" },
    {
      instructions:
        "You are connected as one Billy Kyle client. Every tool is limited to that client's BK code. You cannot see other clients, prices, or admin tools. Bookings use the same rules as the client portal: offered times only, including Twilight sunset slots, drive buffers, business hours, and free/busy on Work and Personal. Overlaps and past times are rejected. Notes is the lockbox field. A short access code in notes is added to the calendar title the same way as the booking form. Shoot emails say the shoot was booked through an agent and do not name you.",
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
        const result = await runClientTool(name, args as Record<string, unknown>, ctx, ops);
        await ops
          .audit({
            tokenId: ctx.tokenId,
            clientId: ctx.clientId,
            userId: ctx.userId,
            tool: name,
            summary: result.summary,
            ok: result.ok,
          })
          .catch((error) => console.error("client-agent audit failed", error));
        console.info(`client-agent ${name} ${result.ok ? "ok" : "error"}`);
        if (!result.ok) return toolResult(result.error ?? "The tool failed.", true);
        if (result.revalidate.length > 0) await revalidatePaths(result.revalidate);
        return toolResult(JSON.stringify(result.data, null, 2));
      } catch (error) {
        console.error(`client-agent ${name} failed`, error);
        console.info(`client-agent ${name} error`);
        await ops
          .audit({
            tokenId: ctx.tokenId,
            clientId: ctx.clientId,
            userId: ctx.userId,
            tool: name,
            summary: "The tool failed.",
            ok: false,
          })
          .catch(() => undefined);
        return toolResult("The tool failed.", true);
      }
    });
  };

  register(
    "list_my_shoots",
    "List this client's delivered shoots. Each row includes the date, address, file counts, and the public share link for the delivered files.",
    { limit: z.number().int().positive().max(200).optional().describe("Default 50, max 200.") },
    readOnly,
  );
  register(
    "get_my_shoot",
    "Get one of this client's shoots, including file names and the public share link for the delivered files. A shoot on another client is not found.",
    { shootId: z.string().describe("Shoot id from list_my_shoots.") },
    readOnly,
  );
  register(
    "list_my_bookings",
    "List this client's bookings. when is upcoming, past, or all (default all). Cancelled bookings are hidden unless includeCancelled is true. Queued shoots have no start time and appear in all.",
    {
      when: z.enum(["upcoming", "past", "all"]).optional(),
      includeCancelled: z.boolean().optional(),
      limit: z.number().int().positive().max(200).optional(),
    },
    readOnly,
  );
  register(
    "get_my_booking",
    "Get one of this client's bookings, including address, services, times, and notes. A booking on another client is not found.",
    { bookingId: z.string() },
    readOnly,
  );
  register(
    "list_services",
    "List the services this client's category can book. Same allow-list as the client scheduling form. Does not include prices.",
    {},
    readOnly,
  );
  register(
    "get_available_slots",
    "Open times for an address and services, using the same rules as the client scheduling page: business hours, drive buffers, free/busy on Work and Personal, blocked days, and Twilight sunset slots. When Twilight is combined with other services, slots are the daytime appointment and twilightSlots are the sunset appointment. Past times and overlaps are not offered.",
    {
      address: z.string().describe("Full street address."),
      services: z.array(z.string()).min(1).describe(serviceHelp),
      commercialHours: z
        .number()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe("Required when services include Commercial video. Whole hours from 1 to 8."),
    },
    readOnly,
  );
  register(
    "create_booking",
    "Book a shoot directly for this client. No approval step. The start must be an offered slot from get_available_slots. Overlaps and past times are rejected. Notes is the lockbox field: a short access code there is added to the calendar title, same as the booking form. Twilight plus other services needs twilightStartsAt for the sunset appointment. Creates the same Work calendar event and shoot emails as a client booking, plus one line that the shoot was booked through an agent.",
    {
      address: z.string(),
      services: z.array(z.string()).min(1).describe(serviceHelp),
      startsAt: z.string().describe("ISO start from an offered slot."),
      endsAt: z.string().optional().describe("ISO end from that same slot. Omit to use the offered end for this start."),
      twilightStartsAt: z.string().optional().describe("Sunset slot start when Twilight is combined with other services."),
      twilightEndsAt: z.string().optional(),
      notes: z.string().optional().describe("Notes, access info, or lockbox code."),
      commercialHours: z.number().int().min(1).max(8).optional(),
    },
    write,
  );
  register(
    "modify_booking",
    "Change one of this client's upcoming bookings, or put a queued shoot on an offered time. Omitted fields stay. Uses the client slot grid. Overlaps and past times are rejected. Notes is the lockbox field. Sends the same Shoot changes email as the portal, plus one line that the shoot was booked through an agent.",
    {
      bookingId: z.string(),
      address: z.string().optional(),
      services: z.array(z.string()).min(1).optional().describe(serviceHelp),
      startsAt: z.string().optional().describe("ISO start from an offered slot."),
      endsAt: z.string().optional(),
      notes: z.string().nullable().optional().describe("Notes, access info, or lockbox code. Null clears it."),
      commercialHours: z.number().int().min(1).max(8).nullable().optional(),
    },
    write,
  );
  register(
    "cancel_booking",
    "Cancel one of this client's upcoming bookings. Same calendar delete and cancellation emails as the portal, plus one line that the shoot was booked through an agent.",
    { bookingId: z.string() },
    destroy,
  );

  return server;
}
