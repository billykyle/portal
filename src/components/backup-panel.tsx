export function BackupPanel({ dropboxUrl }: { dropboxUrl: string | null }) {
  return (
    <details className="rounded-xl bg-[#111] px-4">
      <summary className="cursor-pointer list-none py-4 text-sm text-[#8e8e93] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between">
          Backup
          <span aria-hidden className="text-xs">
            ▾
          </span>
        </span>
      </summary>
      <div className="pb-4 text-sm text-[#c7c7cc]">
        {dropboxUrl ? (
          <a href={dropboxUrl} target="_blank" rel="noreferrer" className="break-all underline">
            Open Dropbox backup
          </a>
        ) : (
          <p>No backup link for this shoot.</p>
        )}
      </div>
    </details>
  );
}
