import Link from "next/link";
import { DeliverableSection } from "@/components/deliverable-section";
import { MediaTile } from "@/components/media-tile";
import { PhotoViewer } from "@/components/photo-viewer";
import { pageHeadingWrapClass, pageStackClass, pageTitleClass } from "@/components/phone-shell";
import { ShootActions } from "@/components/shoot-actions";
import { ShootList } from "@/components/shoot-list";
import { RawVideoSection, rawVideoJump } from "@/components/raw-video-section";
import { ShootSectionNav } from "@/components/shoot-section-nav";
import { VideoPlayer } from "@/components/video-player";
import { galleryMedia, type ContentTemplate } from "@/components/templates/types";
import { isPdfFilename, mediaLabel, mediaSectionId } from "@/lib/media";
import { photoViewerHref } from "@/lib/photo-viewer";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";
import { shootSectionStartsOpen } from "@/lib/shoot-sections";

function DefaultLibrary({ client, shoots }: Parameters<ContentTemplate["Library"]>[0]) {
  return (
    <>
      <div className={pageHeadingWrapClass}>
        <h1 className={pageTitleClass}>{client?.displayName ?? "Your shoots"}</h1>
        {client?.primaryEmail ? <p className="mt-1 text-sm text-[#8e8e93]">{client.primaryEmail}</p> : null}
        {client?.company ? <p className="text-sm text-[#8e8e93]">{client.company}</p> : null}
      </div>
      <div className={pageStackClass}>
        <ShootList
          emptyLabel="No shoots yet. Billy will post them here."
          shoots={shoots.map((shoot) => ({
            id: shoot.id,
            href: shoot.href,
            address: shoot.address,
            shotDate: shoot.shotDate,
            dateLabel: shoot.dateLabel,
          }))}
        />
      </div>
    </>
  );
}

function DefaultAdminShoots({ shoots }: Parameters<ContentTemplate["AdminShoots"]>[0]) {
  return (
    <ShootList
      variant="admin"
      emptyLabel="No shoots attached yet."
      shoots={shoots.map((shoot) => ({
        id: shoot.id,
        href: shoot.href,
        address: shoot.address,
        shotDate: shoot.shotDate,
        dateLabel: shoot.dateLabel,
        fileCount: shoot.fileCount,
        publicToken: shoot.publicToken,
      }))}
    />
  );
}

function DefaultShoot({
  basePath,
  viewId,
  address,
  dateLabel,
  folderName,
  zipUrl,
  media: source,
  shareToken,
  closedSectionIds,
}: Parameters<ContentTemplate["Shoot"]>[0]) {
  const media = galleryMedia(source);
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
  const jumps = [
    photos.length > 0 ? { id: mediaSectionId("photo"), label: mediaLabel("photo"), count: photos.length } : null,
    plans.length > 0
      ? { id: mediaSectionId("floor_plan"), label: mediaLabel("floor_plan"), count: plans.length }
      : null,
    videos.length > 0 ? { id: mediaSectionId("video"), label: mediaLabel("video"), count: videos.length } : null,
    rawVideoJump(rawVideos.length),
  ].filter((item) => item !== null);

  return (
    <div className="flex flex-col gap-6 pb-16 lg:gap-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <header className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-[#8e8e93]">{dateLabel}</p>
          <h1 className="text-xl font-medium leading-snug lg:text-2xl">{address}</h1>
        </header>

        <div className="lg:shrink-0">
          <ShootActions files={files} folderName={folderName} zipUrl={zipUrl} shareToken={shareToken} />
        </div>
      </div>

      <ShootSectionNav items={jumps} />

      {photos.length > 0 ? (
        <DeliverableSection
          id={mediaSectionId("photo")}
          label={mediaLabel("photo")}
          defaultOpen={shootSectionStartsOpen(closed, mediaSectionId("photo"))}
        >
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
        </DeliverableSection>
      ) : null}

      {plans.length > 0 ? (
        <DeliverableSection
          id={mediaSectionId("floor_plan")}
          label={mediaLabel("floor_plan")}
          defaultOpen={shootSectionStartsOpen(closed, mediaSectionId("floor_plan"))}
        >
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
        </DeliverableSection>
      ) : null}

      {videos.length > 0 ? (
        <DeliverableSection
          id={mediaSectionId("video")}
          label={mediaLabel("video")}
          defaultOpen={shootSectionStartsOpen(closed, mediaSectionId("video"))}
        >
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
        </DeliverableSection>
      ) : null}

      <RawVideoSection videos={rawVideos} closed={closed} />

      {media.length === 0 ? <p className="text-sm text-[#8e8e93]">No files on this shoot yet.</p> : null}

      {activePhoto && viewId ? <PhotoViewer photos={photos} initialId={viewId} basePath={basePath} /> : null}

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
              <iframe src={activePlan.url} title={activePlan.filename} className="h-full min-h-[70vh] w-full bg-white" />
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

export const defaultTemplate: ContentTemplate = {
  Library: DefaultLibrary,
  AdminShoots: DefaultAdminShoots,
  Shoot: DefaultShoot,
};
