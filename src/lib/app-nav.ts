import { CLIENT_HOME, isClientHomePath } from "@/lib/routes";

export type AppNavSide = "client" | "admin";

export type AppNavItem = {
  id: string;
  href: string;
  label: string;
};

/** Primary client destinations. Labels match the home page cards. */
export const CLIENT_NAV: AppNavItem[] = [
  { id: "home", href: CLIENT_HOME, label: "Home" },
  { id: "library", href: "/my-content", label: "My Content" },
  { id: "scheduling", href: "/scheduling", label: "Scheduling" },
];

/** Top-level admin destinations that already exist as peer pages. */
export const ADMIN_NAV: AppNavItem[] = [
  { id: "home", href: "/admin/home", label: "Home" },
  { id: "clients", href: "/admin/clients", label: "Clients" },
  { id: "bookings", href: "/admin/bookings", label: "Bookings" },
];

export function navItemsFor(side: AppNavSide) {
  return side === "admin" ? ADMIN_NAV : CLIENT_NAV;
}

/** Which primary item owns this pathname, if any. Account stays outside the menu. */
export function activeNavId(side: AppNavSide, pathname: string) {
  if (side === "admin") {
    if (pathname === "/admin/home" || pathname.startsWith("/admin/home/")) return "home";
    if (pathname === "/admin/bookings" || pathname.startsWith("/admin/bookings/")) return "bookings";
    if (pathname === "/admin/clients" || pathname.startsWith("/admin/clients/") || pathname.startsWith("/shoots/")) {
      return "clients";
    }
    return null;
  }
  if (isClientHomePath(pathname)) return "home";
  if (pathname === "/my-content" || pathname.startsWith("/my-content/") || pathname.startsWith("/shoots/")) {
    return "library";
  }
  if (pathname === "/scheduling" || pathname.startsWith("/scheduling/")) return "scheduling";
  return null;
}
