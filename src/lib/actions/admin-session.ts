"use server";

import { redirect } from "next/navigation";
import {
  adminPasswordMatches,
  clearAdminSession,
  createAdminSession,
} from "@/lib/admin-auth";

export type AdminSessionState = {
  error?: string;
};

export async function adminLogin(_prev: AdminSessionState | undefined, formData: FormData) {
  if (!adminPasswordMatches(String(formData.get("password") ?? ""))) {
    return { error: "Password is incorrect." };
  }
  await createAdminSession();
  redirect("/admin/clients");
}

export async function adminLogout() {
  await clearAdminSession();
  redirect("/admin");
}
