import { revalidatePath } from "next/cache";
import { ADMIN_HOME, adminHomeCachePaths } from "@/lib/routes";

/** Refresh the public admin home URL and the page file behind the host rewrite. */
export function revalidateAdminHome(pathname = ADMIN_HOME) {
  for (const path of adminHomeCachePaths(pathname)) revalidatePath(path);
}
