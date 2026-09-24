export type AppNavSide = "client" | "admin";

export type AppNavItem = {
  id: string;
  href: string;
  label: string;
};

/** Primary client destinations. Labels match the hub cards. */
export const CLIENT_NAV: AppNavItem[] = [
  { id: "home", href: "/hub", label: "Home" },
  { id: "library", href: "/library", label: "My Content" },
  { id: "scheduling", href: "/scheduling", label: "Scheduling" },
];

/** Top-level admin destinations that already exist as peer pages. */
export const ADMIN_NAV: AppNavItem[] = [
  { id: "clients", href: "/admin/clients", label: "Clients" },
  { id: "bookings", href: "/admin/bookings", label: "Bookings" },
];

export function navItemsFor(side: AppNavSide) {
  return side === "admin" ? ADMIN_NAV : CLIENT_NAV;
}

/** Which primary item owns this pathname, if any. Account stays outside the menu. */
export function activeNavId(side: AppNavSide, pathname: string) {
  if (side === "admin") {
    if (pathname === "/admin/bookings" || pathname.startsWith("/admin/bookings/")) return "bookings";
    if (pathname === "/admin/clients" || pathname.startsWith("/admin/clients/") || pathname.startsWith("/shoots/")) {
      return "clients";
    }
    return null;
  }
  if (pathname === "/hub" || pathname.startsWith("/hub/")) return "home";
  if (pathname === "/library" || pathname.startsWith("/library/") || pathname.startsWith("/shoots/")) {
    return "library";
  }
  if (pathname === "/scheduling" || pathname.startsWith("/scheduling/")) return "scheduling";
  return null;
}
