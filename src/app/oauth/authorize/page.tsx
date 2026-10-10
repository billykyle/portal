import { inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { SigninForm } from "@/components/forms/signin-form";
import { FormColumn, pageTitleClass, PhoneShell } from "@/components/phone-shell";
import { signOutForOauth } from "@/lib/actions/client-agent";
import { getSession } from "@/lib/auth";
import { describeAuthorize } from "@/lib/client-agent/flow";
import { externalOrigin } from "@/lib/client-agent/protocol";
import { postgresClientConnectorStore } from "@/lib/client-agent/pg-store";
import { db } from "@/lib/db";
import { ensureDb } from "@/lib/db/ensure";
import { clients } from "@/lib/db/schema";
import { listPortalsForUser } from "@/lib/user-portals";

export const dynamic = "force-dynamic";

export default async function OauthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "portal_error") continue;
    if (typeof value === "string") search.set(key, value);
  }
  const headerStore = await headers();
  const origin = externalOrigin(new Request("https://portal.billy-kyle.com/oauth/authorize", { headers: headerStore }));
  const described = await describeAuthorize(postgresClientConnectorStore(), search, origin);
  if (!described.ok && described.redirect) redirect(described.redirect);
  const portalError = typeof query.portal_error === "string" ? query.portal_error : "";
  const returnTo = `/oauth/authorize?${search.toString()}`;

  return (
    <PhoneShell>
      <AppHeader />
      <FormColumn center className="pb-16">
        <h1 className={`${pageTitleClass} mb-3`}>Connect an agent</h1>
        {described.ok ? (
          <Consent
            clientName={described.request.clientId ? described.clientName : ""}
            request={described.request}
            returnTo={returnTo}
            portalError={portalError}
          />
        ) : (
          <p className="text-sm leading-6 text-[#c7c7cc]">{described.message}</p>
        )}
      </FormColumn>
    </PhoneShell>
  );
}

async function Consent({
  clientName,
  request,
  returnTo,
  portalError,
}: {
  clientName: string;
  request: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    state: string | null;
    scope: string;
    resource: string;
  };
  returnTo: string;
  portalError: string;
}) {
  const session = await getSession();
  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm leading-6 text-[#c7c7cc]">
          Sign in with your portal account. {clientName} will ask which BK code it may use.
        </p>
        <SigninForm returnTo={returnTo} />
      </div>
    );
  }
  await ensureDb();
  const portals = await listPortalsForUser(session.userId);
  const accessRows =
    portals.length === 0
      ? []
      : await db
          .select({ id: clients.id, agentAccess: clients.agentAccess })
          .from(clients)
          .where(inArray(clients.id, portals.map((portal) => portal.id)));
  const access = new Map(accessRows.map((row) => [row.id, row.agentAccess]));
  const choices = portals.map((portal) => ({ ...portal, agentAccess: access.get(portal.id) === true }));
  const enabled = choices.filter((portal) => portal.agentAccess);
  const hidden = (
    <>
      <input type="hidden" name="response_type" value="code" />
      <input type="hidden" name="client_id" value={request.clientId} />
      <input type="hidden" name="redirect_uri" value={request.redirectUri} />
      <input type="hidden" name="code_challenge" value={request.codeChallenge} />
      <input type="hidden" name="code_challenge_method" value={request.codeChallengeMethod} />
      <input type="hidden" name="scope" value={request.scope} />
      <input type="hidden" name="resource" value={request.resource} />
      {request.state ? <input type="hidden" name="state" value={request.state} /> : null}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-6 text-[#c7c7cc]">
        <span className="text-white">{clientName}</span> is asking to act as one of your BK codes. It can see shoots
        and bookings for that code and book on the same schedule as the portal.
      </p>
      {portalError ? <p className="text-sm text-[#a1a1a1]">{portalError}</p> : null}
      {enabled.length === 0 ? (
        <p className="text-sm leading-6 text-[#c7c7cc]">
          Agent access is turned off. Ask Billy to turn it on for your BK code before connecting.
        </p>
      ) : (
        <form method="post" action="/oauth/authorize/decision" className="flex flex-col gap-4">
          {hidden}
          <input type="hidden" name="decision" value="approve" />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">BK code</legend>
            {choices.map((portal) => (
              <label key={portal.id} className="flex items-start gap-3 text-sm leading-6">
                <input
                  type="radio"
                  name="portalClientId"
                  value={portal.id}
                  defaultChecked={portal.id === (enabled.find((item) => item.id === session.clientId)?.id ?? enabled[0]?.id)}
                  disabled={!portal.agentAccess}
                  required={portal.agentAccess}
                  className="mt-1"
                />
                <span>
                  <span className="text-white">{portal.displayName}</span>
                  <span className="text-[#8e8e93]"> · {portal.inviteCode}</span>
                  {portal.agentAccess ? null : <span className="block text-[#8e8e93]">Agent access is off</span>}
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="h-12 rounded-xl bg-white text-base text-black">
            Allow
          </button>
        </form>
      )}
      <form method="post" action="/oauth/authorize/decision">
        {hidden}
        <input type="hidden" name="decision" value="deny" />
        <button type="submit" className="text-sm text-[#8e8e93] underline decoration-white/20 underline-offset-4">
          Deny
        </button>
      </form>
      <form action={signOutForOauth}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <button type="submit" className="text-sm text-[#8e8e93] underline decoration-white/20 underline-offset-4">
          Use a different account
        </button>
      </form>
      <p className="text-xs text-[#8e8e93]">Signed in as {session.email}</p>
    </div>
  );
}
