import { headers } from "next/headers";
import { isAdminHostname } from "@/lib/hosts";
import { ADMIN_HOME, ADMIN_HOME_PAGE } from "@/lib/routes";

/** `/home` on the admin host. Local `next dev` keeps the page path so a client session at `/home` stays the portal. */
export async function adminLandingPath() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
  return isAdminHostname(host) ? ADMIN_HOME : ADMIN_HOME_PAGE;
}
