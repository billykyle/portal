import { BackupPanel } from "@/components/backup-panel";
import { DownloadAllButton } from "@/components/download-controls";
import { mediaLabel } from "@/lib/media";

export type ShootMedia = {
  id: string;
  url: string;
  filename: string;
  type: "photo" | "video" | "floor_plan";
};

export function ShootDetail({
  address,
  dateLabel,
  dropboxUrl,
  folderName,
  media,
}: {
  address: string;
  dateLabel: string;
  dropboxUrl: string | null;
  folderName: string;
  media: ShootMedia[];
}) {
  const photos = media.filter((item) => item.type === "photo");
  const videos = media.filter((item) => item.type === "video");
  const plans = media.filter((item) => item.type === "floor_plan");
  const viewable = media.filter((item) => item.type !== "video");
  const files = media.map((item) => ({ url: item.url, filename: item.filename }));

  return (
    <div id="gallery" className="flex flex-col gap-8 pb-16">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-[#8e8e93]">{dateLabel}</p>
        <h1 className="text-xl font-medium leading-snug">{address}</h1>
      </header>

      <DownloadAllButton files={files} folderName={folderName} />

      {photos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">{mediaLabel("photo")}</h2>
          <div className="grid grid-cols-2 gap-2">
            {photos.map((item) => (
              <figure key={item.id} className="relative overflow-hidden rounded-xl bg-[#111]">
                <a href={`#view-${item.id}`} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.filename} className="aspect-[4/3] w-full object-cover" />
                </a>
                <a
                  href={item.url}
                  download={item.filename}
                  className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                >
                  Save
                </a>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">{mediaLabel("video")}</h2>
          {videos.map((item) => (
            <figure key={item.id} className="overflow-hidden rounded-xl bg-[#111]">
              <video src={item.url} controls playsInline preload="metadata" className="w-full" />
              <figcaption className="flex items-center justify-between px-3 py-2 text-sm text-[#c7c7cc]">
                <span className="truncate">{item.filename}</span>
                <a href={item.url} download={item.filename} className="text-white">
                  Save
                </a>
              </figcaption>
            </figure>
          ))}
        </section>
      ) : null}

      {plans.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">{mediaLabel("floor_plan")}</h2>
          {plans.map((item) => (
            <figure key={item.id} className="overflow-hidden rounded-xl bg-white">
              <a href={`#view-${item.id}`} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.filename}
                  className="min-h-[220px] w-full bg-white object-contain"
                />
              </a>
              <figcaption className="flex items-center justify-between bg-black px-3 py-2 text-sm text-[#c7c7cc]">
                <span className="truncate">{item.filename}</span>
                <a href={item.url} download={item.filename} className="text-white">
                  Save
                </a>
              </figcaption>
            </figure>
          ))}
        </section>
      ) : null}

      {media.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No files on this shoot yet.</p>
      ) : null}

      <BackupPanel dropboxUrl={dropboxUrl} />

      {viewable.map((item, index) => {
        const prev = viewable[index - 1];
        const next = viewable[index + 1];
        return (
          <div
            key={`view-${item.id}`}
            id={`view-${item.id}`}
            className="lightbox fixed inset-0 z-50 hidden flex-col bg-black"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <a href="#gallery" className="text-sm text-white">
                Close
              </a>
              <p className="truncate px-3 text-sm text-[#a1a1a1]">
                {item.filename} · {index + 1} / {viewable.length}
              </p>
              <a href={item.url} download={item.filename} className="text-sm text-white">
                Save
              </a>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.filename} className="max-h-full max-w-full object-contain" />
            </div>
            <div className="flex justify-between px-4 pb-6 text-sm text-white">
              {prev ? <a href={`#view-${prev.id}`}>Previous</a> : <span />}
              {next ? <a href={`#view-${next.id}`}>Next</a> : <span />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
