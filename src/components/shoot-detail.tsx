import Link from "next/link";
import { DeliverableSection } from "@/components/deliverable-section";
import { PhotoViewer } from "@/components/photo-viewer";
import { ShootActions } from "@/components/shoot-actions";
import { ShootSelection } from "@/components/shoot-selection";
import { RawVideoSection, rawVideoJump } from "@/components/raw-video-section";
import { ShootSectionNav } from "@/components/shoot-section-nav";
import { StillLayout } from "@/components/still-layout";
import { VideoLayout } from "@/components/video-layout";
import type { PlayerRendition } from "@/components/video-player";
import { isPdfFilename, mediaLabel, mediaSectionId } from "@/lib/media";
import { photoViewerHref } from "@/lib/photo-viewer";
import { shootSectionLayout } from "@/lib/shoot-layout";
import { shootSectionStartsOpen } from "@/lib/shoot-sections";

export type ShootMedia = {
  id: string;
  url: string;
  thumbUrl?: string;
  filename: string;
  type: "photo" | "video" | "floor_plan" | "raw_video";
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
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
  closedSectionIds,
  listSectionIds,
}: {
  basePath: string;
  viewId?: string;
  address: string;
  dateLabel: string;
  folderName: string;
  zipUrl?: string;
  media: ShootMedia[];
  shareToken?: string;
  /** Section ids the browser has closed. Omitted means every section starts open. */
  closedSectionIds?: readonly string[];
  /** Section ids this browser shows as a file list. Omitted means grid. */
  listSectionIds?: readonly string[];
}) {
  const photos = media.filter((item) => item.type === "photo");
  const videos = media.filter((item) => item.type === "video");
  const plans = media.filter((item) => item.type === "floor_plan");
  const rawVideos = media.filter((item) => item.type === "raw_video");
  const files = media.map((item) => ({ url: item.url, filename: item.filename, type: item.type }));
  const hrefFor = (id?: string) => photoViewerHref(basePath, id);
  const activePhoto = Boolean(viewId && photos.some((item) => item.id === viewId));
  const planIndex = plans.findIndex((item) => item.id === viewId);
  const activePlan = planIndex >= 0 ? plans[planIndex] : null;
  const prevPlan = activePlan ? plans[planIndex - 1] : null;
  const nextPlan = activePlan ? plans[planIndex + 1] : null;
  const closed = new Set(closedSectionIds ?? []);
  const listed = new Set(listSectionIds ?? []);
  const jumps = [
    photos.length > 0 ? { id: mediaSectionId("photo"), label: mediaLabel("photo"), count: photos.length } : null,
    plans.length > 0
      ? { id: mediaSectionId("floor_plan"), label: mediaLabel("floor_plan"), count: plans.length }
      : null,
    videos.length > 0 ? { id: mediaSectionId("video"), label: mediaLabel("video"), count: videos.length } : null,
    rawVideoJump(rawVideos.length),
  ].filter((item) => item !== null);

  return (
    <ShootSelection
      items={media.map((item) => ({ id: item.id, url: item.url, filename: item.filename }))}
      zipUrl={zipUrl}
      folderName={folderName}
    >
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

      <ShootSectionNav items={jumps} />

      {photos.length > 0 ? (
        <DeliverableSection
          id={mediaSectionId("photo")}
          label={mediaLabel("photo")}
          defaultOpen={shootSectionStartsOpen(closed, mediaSectionId("photo"))}
          layout={shootSectionLayout(listed, mediaSectionId("photo"))}
        >
          {activePhoto && viewId ? (
            <PhotoViewer photos={photos} initialId={viewId} basePath={basePath} />
          ) : null}
          <StillLayout items={photos} basePath={basePath} contain={false} ratio="3/2" />
        </DeliverableSection>
      ) : null}

      {plans.length > 0 ? (
        <DeliverableSection
          id={mediaSectionId("floor_plan")}
          label={mediaLabel("floor_plan")}
          defaultOpen={shootSectionStartsOpen(closed, mediaSectionId("floor_plan"))}
          layout={shootSectionLayout(listed, mediaSectionId("floor_plan"))}
        >
          <StillLayout items={plans} basePath={basePath} contain ratio="square" />
        </DeliverableSection>
      ) : null}

      {videos.length > 0 ? (
        <DeliverableSection
          id={mediaSectionId("video")}
          label={mediaLabel("video")}
          defaultOpen={shootSectionStartsOpen(closed, mediaSectionId("video"))}
          layout={shootSectionLayout(listed, mediaSectionId("video"))}
        >
          <VideoLayout items={videos} columns="pair" />
        </DeliverableSection>
      ) : null}

      <RawVideoSection videos={rawVideos} closed={closed} listed={listed} />

      {media.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No files on this shoot yet.</p>
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
    </ShootSelection>
  );
}

