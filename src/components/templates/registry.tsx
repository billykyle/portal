import type { ClientCategory } from "@/lib/client-category";
import { templateIdForCategory } from "@/lib/client-category";
import { defaultTemplate } from "@/components/templates/default-template";
import { podcastTemplate } from "@/components/templates/podcast-template";
import { realEstateTemplate } from "@/components/templates/real-estate-template";
import type { ContentTemplate } from "@/components/templates/types";

export const contentTemplates = {
  realEstate: realEstateTemplate,
  default: defaultTemplate,
  podcast: podcastTemplate,
  // TODO: construction gets its own layout. Until then it uses default.
  construction: defaultTemplate,
} satisfies Record<"realEstate" | "default" | "podcast" | "construction", ContentTemplate>;

export function contentTemplate(category: ClientCategory): ContentTemplate {
  if (category === "construction") return contentTemplates.construction;
  // Commercial uses the default shoots layout until it has its own.
  if (category === "commercial") return contentTemplates.default;
  return contentTemplates[templateIdForCategory(category)];
}
