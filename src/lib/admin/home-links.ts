import { isNasUnreachableError } from "@/lib/nas-connect";
import {
  ADMIN_HOME_BOOK,
  ADMIN_HOME_CLIENTS,
  ADMIN_HOME_CREATE_CLIENT,
  ADMIN_HOME_MAINTENANCE,
  ADMIN_HOME_NAS_SYNC,
  ADMIN_HOME_PAST,
  ADMIN_HOME_QUEUE,
  ADMIN_HOME_UPCOMING,
} from "@/lib/routes";
import { sortByVisibleLabel } from "./sections";

/** Home rows, A–Z by the label Billy sees. Each one is its own page. */
export const ADMIN_HOME_LINKS = sortByVisibleLabel([
  { id: "clients:all", label: "All clients", href: ADMIN_HOME_CLIENTS },
  { id: "clients:book-shoot", label: "Book a shoot", href: ADMIN_HOME_BOOK },
  { id: "clients:create-client", label: "Create client", href: ADMIN_HOME_CREATE_CLIENT },
  { id: "home:maintenance", label: "Maintenance notice", href: ADMIN_HOME_MAINTENANCE },
  { id: "clients:nas-sync", label: "NAS sync", href: ADMIN_HOME_NAS_SYNC },
  { id: "bookings:past", label: "Past", href: ADMIN_HOME_PAST },
  { id: "bookings:queue", label: "Queue", href: ADMIN_HOME_QUEUE },
  { id: "bookings:upcoming", label: "Upcoming", href: ADMIN_HOME_UPCOMING },
]);

function present(value: string | undefined) {
  return Boolean(value?.trim());
}

function withQuery(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Old home query strings belong on the page that used to expand for them.
 * A bare home visit stays on the link list.
 */
export function adminHomeDestination(params: Record<string, string | undefined>) {
  const nasError = present(params.error) && isNasUnreachableError(params.error ?? "");
  if (
    present(params.synced) ||
    present(params.syncError) ||
    present(params.emailSkipped) ||
    nasError
  ) {
    return withQuery(ADMIN_HOME_NAS_SYNC, params);
  }
  if (present(params.q)) return withQuery(ADMIN_HOME_CLIENTS, params);
  if (present(params.minted) || present(params.error)) return withQuery(ADMIN_HOME_CREATE_CLIENT, params);
  if (
    present(params.maintenance) ||
    present(params.maintenanceError) ||
    present(params.emailed) ||
    present(params.emailFailed)
  ) {
    return withQuery(ADMIN_HOME_MAINTENANCE, params);
  }
  if (present(params.cancelled) || present(params.updated)) return withQuery(ADMIN_HOME_UPCOMING, params);
  return null;
}
