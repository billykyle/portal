import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export function BackupPanel({ dropboxUrl }: { dropboxUrl: string | null }) {
  return (
    <Collapsible className="rounded-xl bg-[#111] px-4">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-4 text-left text-sm text-[#8e8e93]">
        Backup
        <ChevronDown className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-4 text-sm text-[#c7c7cc]">
        {dropboxUrl ? (
          <a href={dropboxUrl} target="_blank" rel="noreferrer" className="break-all underline">
            Open Dropbox backup
          </a>
        ) : (
          <p>No backup link for this shoot.</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
