import Link from "next/link";
import { MediaTile } from "@/components/media-tile";
import { PhotoViewer } from "@/components/photo-viewer";
import { ShootActions } from "@/components/shoot-actions";
import { VideoPlayer, type PlayerRendition } from "@/components/video-player";
import { isPdfFilename, mediaLabel, mediaSectionId } from "@/lib/media";
import { photoViewerHref } from "@/lib/photo-viewer";
import { sectionLabelTextClass } from "@/components/phone-shell";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";

export type ShootMedia = {
  id: string;
  url: string;
  thumbUrl?: string;
  filename: string;
  type: "photo" | "video" | "floor_plan";
  width?: number | null;
  height?: number | null;
  renditions?: PlayerRendition[];
};

export function ShootDetail({
  basePath,
  viewId,
  address,
  dateLabel,
  folderName,
  zipUrl,
  media,
  shareToken,
}: {
  basePath: string;
  viewId?: string;
  address: string;
  dateLabel: string;
  folderName: string;
  zipUrl?: string;
  media: ShootMedia[];
  shareToken?: string;
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
    <div className="flex flex-col gap-6 pb-16 lg:gap-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <header className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-[#8e8e93]">{dateLabel}</p>
          <h1 className="text-xl font-medium leading-snug lg:text-2xl">{address}</h1>
        </header>

        <div className="lg:shrink-0">
          <ShootActions
            files={files}
            folderName={folderName}
            zipUrl={zipUrl}
            shareToken={shareToken}
          />
        </div>
      </div>

      {[photos, plans, videos].filter((group) => group.length > 0).length > 1 ? (
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="Media on this shoot">
          {photos.length > 0 ? (
            <a href={`#${mediaSectionId("photo")}`} className="text-white underline-offset-2 hover:underline">
              {mediaLabel("photo")} ({photos.length})
            </a>
          ) : null}
          {plans.length > 0 ? (
            <a href={`#${mediaSectionId("floor_plan")}`} className="text-white underline-offset-2 hover:underline">
              {mediaLabel("floor_plan")} ({plans.length})
            </a>
          ) : null}
          {videos.length > 0 ? (
            <a href={`#${mediaSectionId("video")}`} className="text-white underline-offset-2 hover:underline">
              {mediaLabel("video")} ({videos.length})
            </a>
          ) : null}
        </nav>
      ) : null}

      {photos.length > 0 ? (
        <section id={mediaSectionId("photo")} className="flex flex-col gap-2">
          <h2 className={sectionLabelTextClass}>{mediaLabel("photo")}</h2>
          <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5 2xl:grid-cols-6">
            {photos.map((item, index) => (
              <MediaTile
                key={item.id}
                href={hrefFor(item.id)}
                src={item.thumbUrl ?? item.url}
                filename={item.filename}
                downloadUrl={item.url}
                contain={false}
                ratio="3/2"
                eager={index < PREVIEW_EAGER_COUNT}
              />
            ))}
          </div>
        </section>
      ) : null}

      {plans.length > 0 ? (
        <section id={mediaSectionId("floor_plan")} className="flex flex-col gap-2">
          <h2 className={sectionLabelTextClass}>{mediaLabel("floor_plan")}</h2>
          <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5">
            {plans.map((item, index) => (
              <MediaTile
                key={item.id}
                href={hrefFor(item.id)}
                src={item.thumbUrl ?? item.url}
                filename={item.filename}
                downloadUrl={item.url}
                contain
                eager={index < PREVIEW_EAGER_COUNT}
              />
            ))}
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section id={mediaSectionId("video")} className="flex flex-col gap-3">
          <h2 className={sectionLabelTextClass}>{mediaLabel("video")}</h2>
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start">
            {videos.map((item) => (
              <VideoPlayer
                key={item.id}
                id={item.id}
                url={item.url}
                filename={item.filename}
                width={item.width}
                height={item.height}
                renditions={item.renditions}
              />
            ))}
          </div>
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
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-6 lg:px-16">
            {isPdfFilename(activePlan.filename) ? (
              <iframe
                src={activePlan.url}
                title={activePlan.filename}
                className="h-full min-h-[70vh] w-full bg-white"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activePlan.url} alt={activePlan.filename} className="max-h-full max-w-full object-contain" />
            )}
            {prevPlan ? (
              <Link
                href={hrefFor(prevPlan.id)}
                className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-sm text-white lg:flex"
              >
                Prev
              </Link>
            ) : null}
            {nextPlan ? (
              <Link
                href={hrefFor(nextPlan.id)}
                className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-sm text-white lg:flex"
              >
                Next
              </Link>
            ) : null}
          </div>
          <div className="flex justify-between px-4 pb-6 text-sm text-white lg:hidden">
            {prevPlan ? <Link href={hrefFor(prevPlan.id)}>Previous</Link> : <span />}
            {nextPlan ? <Link href={hrefFor(nextPlan.id)}>Next</Link> : <span />}
          </div>
        </div>
      ) : null}
    </div>
  );
}

