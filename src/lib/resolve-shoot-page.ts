import { cache } from "react";
import { resolveClientShoot } from "@/lib/shoot-slug";

/** Shared by generateMetadata and the page so one request looks the shoot up once. */
export const resolveShootForPage = cache(resolveClientShoot);
