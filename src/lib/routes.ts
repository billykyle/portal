/** Post-login landing. Invite/signin success used to go straight to My Content. */
export const CLIENT_HOME = "/home";

/** Previous client home slug. Redirects are the only callers. */
const LEGACY_CLIENT_HOME = "/hub";

/** Map a bookmarked `/hub` path onto `/home`. Other paths return null. */
export function legacyClientHomeDestination(pathname: string) {
  if (pathname === LEGACY_CLIENT_HOME) return CLIENT_HOME;
  if (pathname.startsWith(`${LEGACY_CLIENT_HOME}/`)) {
    return `${CLIENT_HOME}${pathname.slice(LEGACY_CLIENT_HOME.length)}`;
  }
  return null;
}

export function isClientHomePath(pathname: string) {
  return pathname === CLIENT_HOME || pathname.startsWith(`${CLIENT_HOME}/`);
}

export const PORTAL_CHOOSER = "/choose";
export const CLIENT_LIBRARY = "/my-content";
export const CLIENT_ACCOUNT = "/account";
export const CLIENT_SCHEDULING = "/scheduling";
export const CLIENT_SCHEDULING_TIMES = "/scheduling/times";
export const CLIENT_SCHEDULING_CONFIRMED = "/scheduling/confirmed";
export const ADMIN_HOME = "/admin/home";
export const ADMIN_HOME_CLIENTS = "/admin/home/clients";
export const ADMIN_HOME_BOOK = "/admin/home/book";
export const ADMIN_HOME_CREATE_CLIENT = "/admin/home/create-client";
export const ADMIN_HOME_MAINTENANCE = "/admin/home/maintenance";
export const ADMIN_HOME_NAS_SYNC = "/admin/home/nas-sync";
export const ADMIN_HOME_PAST = "/admin/home/past";
export const ADMIN_HOME_QUEUE = "/admin/home/queue";
export const ADMIN_HOME_UPCOMING = "/admin/home/upcoming";
export const ADMIN_BOOKINGS = "/admin/bookings";
