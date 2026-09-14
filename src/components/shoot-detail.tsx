import Link from "next/link";
import { MediaTile } from "@/components/media-tile";
import { PhotoViewer } from "@/components/photo-viewer";
import { ShootActions } from "@/components/shoot-actions";
import { mediaLabel } from "@/lib/media";
import { photoViewerHref } from "@/lib/photo-viewer";

export type ShootMedia = {
  id: string;
  url: string;
  thumbUrl?: string;
  filename: string;
  type: "photo" | "video" | "floor_plan";
};

export function ShootDetail({
  basePath,
  viewId,
  address,
  dateLabel,
  dropboxUrl,
  folderName,
  zipUrl,
  media,
  shareToken,
  showBackup = false,
}: {
  basePath: string;
  viewId?: string;
  address: string;
  dateLabel: string;
  dropboxUrl: string | null;
  folderName: string;
  zipUrl?: string;
  media: ShootMedia[];
  shareToken?: string;
  showBackup?: boolean;
}) {
  const photos = media.filter((item) => item.type === "photo");
  const videos = media.filter((item) => item.type === "video");
  const plans = media.filter((item) => item.type === "floor_plan");
  const files = media.map((item) => ({ url: item.url, filename: item.filename, type: item.type }));
  const hrefFor = (id?: string) => photoViewerHref(basePath, id);
  const activePhoto = Boolean(viewId && photos.some((item) => item.id === viewId));
  const planIndex = plans.findIndex((item) => item.id === viewId);
  const activePlan = planIndex >= 0 ? plans[planIndex] : null;
  const prevPlan = activePlan ? plans[planIndex - 1] : null;
  const nextPlan = activePlan ? plans[planIndex + 1] : null;

  return (
    <div className="flex flex-col gap-6 pb-16">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-[#8e8e93]">{dateLabel}</p>
        <h1 className="text-xl font-medium leading-snug">{address}</h1>
      </header>

      <ShootActions
        files={files}
        folderName={folderName}
        zipUrl={zipUrl}
        shareToken={shareToken}
        dropboxUrl={dropboxUrl}
        showBackup={showBackup}
      />

      {photos.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">{mediaLabel("photo")}</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((item) => (
              <MediaTile
                key={item.id}
                href={hrefFor(item.id)}
                src={item.thumbUrl ?? item.url}
                filename={item.filename}
                downloadUrl={item.url}
                contain={false}
              />
            ))}
          </div>
        </section>
      ) : null}

      {plans.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm uppercase tracking-[0.14em] text-[#8e8e93]">{mediaLabel("floor_plan")}</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {plans.map((item) => (
              <MediaTile
                key={item.id}
                href={hrefFor(item.id)}
                src={item.thumbUrl ?? item.url}
                filename={item.filename}
                downloadUrl={item.url}
                contain
              />
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
                  Download
                </a>
              </figcaption>
            </figure>
          ))}
        </section>
      ) : null}

      {media.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No files on this shoot yet.</p>
      ) : null}

      {activePhoto && viewId ? (
        <PhotoViewer photos={photos} initialId={viewId} basePath={basePath} />
      ) : null}

      {activePlan ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href={hrefFor()} className="text-sm text-white">
              Close
            </Link>
            <p className="truncate px-3 text-sm text-[#a1a1a1]">
              {activePlan.filename} · {planIndex + 1} / {plans.length}
            </p>
            <a href={activePlan.url} download={activePlan.filename} className="text-sm text-white">
              Download
            </a>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activePlan.url} alt={activePlan.filename} className="max-h-full max-w-full object-contain" />
          </div>
          <div className="flex justify-between px-4 pb-6 text-sm text-white">
            {prevPlan ? <Link href={hrefFor(prevPlan.id)}>Previous</Link> : <span />}
            {nextPlan ? <Link href={hrefFor(nextPlan.id)}>Next</Link> : <span />}
          </div>
        </div>
      ) : null}
    </div>
  );
}

