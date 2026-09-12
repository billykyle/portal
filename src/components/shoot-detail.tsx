import Link from "next/link";
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
  shootId,
  viewId,
  address,
  dateLabel,
  dropboxUrl,
  folderName,
  media,
}: {
  shootId: string;
  viewId?: string;
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
  const activeIndex = viewable.findIndex((item) => item.id === viewId);
  const active = activeIndex >= 0 ? viewable[activeIndex] : null;
  const prev = active ? viewable[activeIndex - 1] : null;
  const next = active ? viewable[activeIndex + 1] : null;
  const hrefFor = (id?: string) => (id ? `/shoots/${shootId}?view=${id}` : `/shoots/${shootId}`);

  return (
    <div className="flex flex-col gap-8 pb-16">
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
                <Link href={hrefFor(item.id)} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.filename} className="aspect-[4/3] w-full object-cover" />
                </Link>
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
              <Link href={hrefFor(item.id)} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.filename}
                  className="min-h-[220px] w-full bg-white object-contain"
                />
              </Link>
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

      {active ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href={hrefFor()} className="text-sm text-white">
              Close
            </Link>
            <p className="truncate px-3 text-sm text-[#a1a1a1]">
              {active.filename} · {activeIndex + 1} / {viewable.length}
            </p>
            <a href={active.url} download={active.filename} className="text-sm text-white">
              Save
            </a>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.url} alt={active.filename} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex justify-between px-4 pb-6 text-sm text-white">
            {prev ? <Link href={hrefFor(prev.id)}>Previous</Link> : <span />}
            {next ? <Link href={hrefFor(next.id)}>Next</Link> : <span />}
          </div>
        </div>
      ) : null}
    </div>
  );
}
