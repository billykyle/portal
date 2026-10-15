import { handleAgentMcp } from "@/lib/agent/http";
import { portalAgentOps } from "@/lib/agent/ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Sync from NAS continues in `after()` on this route. The share walk needs the longer limit. */
export const maxDuration = 800;

async function handle(request: Request) {
  return handleAgentMcp(request, portalAgentOps);
}

export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };
