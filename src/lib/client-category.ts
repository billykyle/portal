export const CLIENT_CATEGORIES = ["real_estate", "construction", "podcast", "other"] as const;

export type ClientCategory = (typeof CLIENT_CATEGORIES)[number];

export const CLIENT_CATEGORY_LABEL: Record<ClientCategory, string> = {
  real_estate: "Real Estate",
  construction: "Construction",
  podcast: "Podcast",
  other: "Other",
};

/** New records, including Create client. Billy can change them. */
export const NEW_CLIENT_CATEGORY: ClientCategory = "other";

export type ContentTemplateId = "realEstate" | "default" | "podcast";

/** construction uses default until it has its own layout. */
export function templateIdForCategory(category: ClientCategory): ContentTemplateId {
  if (category === "real_estate") return "realEstate";
  if (category === "podcast") return "podcast";
  return "default";
}

export function isClientCategory(value: string): value is ClientCategory {
  return (CLIENT_CATEGORIES as readonly string[]).includes(value);
}

/** Missing or blank becomes the new-client default. Anything else is rejected. */
export function readClientCategory(value: unknown): ClientCategory | null {
  if (value == null || value === "") return NEW_CLIENT_CATEGORY;
  const text = String(value).trim();
  if (!text) return NEW_CLIENT_CATEGORY;
  return isClientCategory(text) ? text : null;
}
