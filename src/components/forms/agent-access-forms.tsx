"use client";

import { disconnectMyAgent, revokeClientAgentConnection, setClientAgentAccess } from "@/lib/actions/client-agent";

export function AgentAccessToggle({ clientId, enabled }: { clientId: string; enabled: boolean }) {
  return (
    <form
      action={setClientAgentAccess}
      onSubmit={(event) => {
        if (!enabled) return;
        if (!window.confirm("Turn off agent access? Every connected agent for this client stops immediately.")) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
      <p className="text-sm leading-6 text-[#c7c7cc]">
        {enabled
          ? "Agent access is on. A connected assistant can read this client and book on the portal schedule."
          : "Agent access is off. Nothing can connect until you turn it on."}
      </p>
      <button type="submit" className="h-12 rounded-xl bg-white text-base text-black">
        {enabled ? "Turn off" : "Turn on"}
      </button>
    </form>
  );
}

export function RevokeAgentButton({ clientId, tokenId, agentName }: { clientId: string; tokenId: string; agentName: string }) {
  return (
    <form
      action={revokeClientAgentConnection}
      onSubmit={(event) => {
        if (!window.confirm(`Revoke ${agentName}? It will have to connect again.`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="tokenId" value={tokenId} />
      <button type="submit" className="text-sm text-[#8e8e93] underline decoration-white/20 underline-offset-4">
        Revoke
      </button>
    </form>
  );
}

export function DisconnectAgentButton({ tokenId, agentName }: { tokenId: string; agentName: string }) {
  return (
    <form
      action={disconnectMyAgent}
      onSubmit={(event) => {
        if (!window.confirm(`Disconnect ${agentName}? It will lose access to this BK code.`)) event.preventDefault();
      }}
    >
      <input type="hidden" name="tokenId" value={tokenId} />
      <button type="submit" className="text-sm text-[#8e8e93] underline decoration-white/20 underline-offset-4">
        Disconnect
      </button>
    </form>
  );
}
