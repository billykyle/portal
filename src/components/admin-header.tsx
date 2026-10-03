import { AppHeader } from "@/components/app-header";
import { NavMenu } from "@/components/nav-menu";
import { SignOutButton } from "@/components/sign-out-button";

/** Top-left is only the menu. Page names stay out of the header. */
export function AdminHeader() {
  return (
    <AppHeader surface="admin" left={<NavMenu side="admin" />} right={<SignOutButton admin />} />
  );
}
