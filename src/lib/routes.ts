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

/**
 * Admin dashboard on the admin host. The page files stay under `/admin/home`
 * so the portal host can keep its own `/home`. Middleware rewrites this path
 * on the admin host and 308s the old URL here.
 */
export const ADMIN_HOME = "/home";

/** App route that renders the admin dashboard. Local `next dev` still opens this directly. */
export const ADMIN_HOME_PAGE = "/admin/home";

export const ADMIN_HOME_CLIENTS = "/home/clients";
export const ADMIN_HOME_BOOK = "/home/book";
export const ADMIN_HOME_CREATE_CLIENT = "/home/create-client";
export const ADMIN_HOME_MAINTENANCE = "/home/maintenance";
export const ADMIN_HOME_NAS_SYNC = "/home/nas-sync";
export const ADMIN_HOME_PAST = "/home/past";
export const ADMIN_HOME_QUEUE = "/home/queue";
export const ADMIN_HOME_UPCOMING = "/home/upcoming";
export const ADMIN_BOOKINGS = "/admin/bookings";

export function isAdminHomePath(pathname: string) {
  return pathname === ADMIN_HOME || pathname.startsWith(`${ADMIN_HOME}/`);
}

/** Map a bookmarked `/admin/home` path onto `/home`. Other paths return null. */
export function legacyAdminHomeDestination(pathname: string) {
  if (pathname === ADMIN_HOME_PAGE) return ADMIN_HOME;
  if (pathname.startsWith(`${ADMIN_HOME_PAGE}/`)) {
    return `${ADMIN_HOME}${pathname.slice(ADMIN_HOME_PAGE.length)}`;
  }
  return null;
}

/** Filesystem page for a public admin home URL. Other paths return null. */
export function adminHomePagePath(pathname: string) {
  if (pathname === ADMIN_HOME) return ADMIN_HOME_PAGE;
  if (pathname.startsWith(`${ADMIN_HOME}/`)) {
    return `${ADMIN_HOME_PAGE}${pathname.slice(ADMIN_HOME.length)}`;
  }
  return null;
}

export function isAdminHomePagePath(pathname: string) {
  return legacyAdminHomeDestination(pathname) !== null;
}

/** Public URL and the page file, so a rewrite and the browser route both refresh. */
export function adminHomeCachePaths(pathname = ADMIN_HOME) {
  const pub = isAdminHomePath(pathname) ? pathname : legacyAdminHomeDestination(pathname);
  const page = pub ? adminHomePagePath(pub) : isAdminHomePagePath(pathname) ? pathname : null;
  return [...new Set([pub, page].filter((item): item is string => Boolean(item)))];
}
