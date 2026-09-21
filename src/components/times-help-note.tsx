import { cn } from "@/lib/utils";
import {
  TIMES_HELP_CONTACT_EMAIL,
  TIMES_HELP_CONTACT_LABEL,
  TIMES_HELP_COPY,
} from "@/lib/scheduling/times-help";

/** Helper under the times-page address/services summary. */
export function TimesHelpNote({ className }: { className?: string }) {
  const marker = TIMES_HELP_CONTACT_LABEL;
  const index = TIMES_HELP_COPY.indexOf(marker);
  const before = index === -1 ? TIMES_HELP_COPY : TIMES_HELP_COPY.slice(0, index);
  const after = index === -1 ? "" : TIMES_HELP_COPY.slice(index + marker.length);

  return (
    <p className={cn("mt-5 max-w-prose text-sm leading-6 text-[#8e8e93]", className)}>
      {before}
      <a
        href={`mailto:${TIMES_HELP_CONTACT_EMAIL}`}
        className="text-white underline underline-offset-2"
      >
        {marker}
      </a>
      {after}
    </p>
  );
}
