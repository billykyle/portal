import Link from "next/link";
import { CopyPublicLink } from "@/components/copy-public-link";
import { DeliverableSection } from "@/components/deliverable-section";
import { PhotoViewer } from "@/components/photo-viewer";
import { pageHeadingWrapClass, pageStackClass, pageTitleClass, shootCardGridClass } from "@/components/phone-shell";
import { PreviewImage } from "@/components/preview-image";
import { ShootActions } from "@/components/shoot-actions";
import { RawVideoSection, rawVideoJump } from "@/components/raw-video-section";
import { ShootSectionNav } from "@/components/shoot-section-nav";
import { StillLayout } from "@/components/still-layout";
import type { ContentTemplate, TemplateShootCard } from "@/components/templates/types";
import { VideoLayout } from "@/components/video-layout";
import { groupPodcastFiles, parseEpisodeIdentity } from "@/lib/podcast-episode";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";
import { shootSectionLayout } from "@/lib/shoot-layout";
import { shootSectionStartsOpen } from "@/lib/shoot-sections";

const SECTIONS = {
  full: "full-episode",
  clips: "clips",
  audio: "audio",
  stills: "thumbnails",
} as const;

function EpisodeCards({
  shoots,
  emptyLabel,
  admin = false,
}: {
  shoots: TemplateShootCard[];
  emptyLabel: string;
  admin?: boolean;
}) {
  if (shoots.length === 0) {
    return <p className="text-sm text-[#8e8e93]">{emptyLabel}</p>;
  }

  return (
    <ul className={shootCardGridClass}>
      {shoots.map((shoot, index) => {
        const identity = parseEpisodeIdentity(shoot.address, shoot.folderName);
        return (
          <li key={shoot.id} className="border-b border-white/10 py-4 lg:rounded-xl lg:border lg:p-5">
            <Link href={shoot.href} className="flex flex-col gap-3">
              <div className="aspect-[3/2] overflow-hidden rounded-lg bg-[#1c1c1e]">
                {shoot.thumbUrl ? (
                  <PreviewImage src={shoot.thumbUrl} alt="" eager={index < PREVIEW_EAGER_COUNT} />
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[15px]">{identity.heading}</p>
                {identity.guest ? <p className="truncate text-sm text-[#c7c7cc]">{identity.guest}</p> : null}
                <p className="text-sm text-[#8e8e93]">{shoot.dateLabel}</p>
              </div>
            </Link>
            {admin ? (
              <div className="mt-2">
                <CopyPublicLink token={shoot.publicToken} compact />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function PodcastLibrary({ client, shoots }: Parameters<ContentTemplate["Library"]>[0]) {
  return (
    <>
      <div className={pageHeadingWrapClass}>
        <h1 className={pageTitleClass}>{client?.displayName ?? "Your episodes"}</h1>
        {client?.primaryEmail ? <p className="mt-1 text-sm text-[#8e8e93]">{client.primaryEmail}</p> : null}
        {client?.company ? <p className="text-sm text-[#8e8e93]">{client.company}</p> : null}
      </div>
      <div className={pageStackClass}>
        <EpisodeCards shoots={shoots} emptyLabel="No episodes yet." />
      </div>
    </>
  );
}

function PodcastAdminShoots({ shoots }: Parameters<ContentTemplate["AdminShoots"]>[0]) {
  return <EpisodeCards shoots={shoots} emptyLabel="No episodes yet." admin />;
}

function PodcastShoot({
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
}: Parameters<ContentTemplate["Shoot"]>[0]) {
  const groups = groupPodcastFiles(media);
  const rawVideos = media.filter((item) => item.type === "raw_video");
  const identity = parseEpisodeIdentity(address, folderName);
  const files = media.map((item) =>
    item.type === "audio"
      ? { url: item.url, filename: item.filename }
      : { url: item.url, filename: item.filename, type: item.type },
  );
  const stills = groups.stills;
  const activeStill = Boolean(viewId && stills.some((item) => item.id === viewId));
  const closed = new Set(closedSectionIds ?? []);
  const listed = new Set(listSectionIds ?? []);
  const jumps = [
    groups.full ? { id: SECTIONS.full, label: "Full episode", count: 1 } : null,
    groups.clips.length > 0 ? { id: SECTIONS.clips, label: "Clips", count: groups.clips.length } : null,
    groups.audio.length > 0 ? { id: SECTIONS.audio, label: "Audio", count: groups.audio.length } : null,
    stills.length > 0 ? { id: SECTIONS.stills, label: "Thumbnails", count: stills.length } : null,
    rawVideoJump(rawVideos.length),
  ].filter((item) => item !== null);

  return (
    <div className="flex flex-col gap-6 pb-16 lg:gap-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <header className="flex min-w-0 flex-col gap-1">
          <p className="text-sm text-[#8e8e93]">{dateLabel}</p>
          <h1 className="text-xl font-medium leading-snug lg:text-2xl">{identity.heading}</h1>
          {identity.guest ? <p className="text-sm text-[#c7c7cc]">{identity.guest}</p> : null}
        </header>
        <div className="lg:shrink-0">
          <ShootActions files={files} folderName={folderName} zipUrl={zipUrl} shareToken={shareToken} />
        </div>
      </div>

      <ShootSectionNav items={jumps} />

      {groups.full ? (
        <DeliverableSection
          id={SECTIONS.full}
          label="Full episode"
          defaultOpen={shootSectionStartsOpen(closed, SECTIONS.full)}
          layout={shootSectionLayout(listed, SECTIONS.full)}
        >
          <VideoLayout items={[groups.full]} columns="single" />
        </DeliverableSection>
      ) : null}

      {groups.clips.length > 0 ? (
        <DeliverableSection
          id={SECTIONS.clips}
          label="Clips"
          defaultOpen={shootSectionStartsOpen(closed, SECTIONS.clips)}
          layout={shootSectionLayout(listed, SECTIONS.clips)}
        >
          <VideoLayout items={groups.clips} columns="clips" />
        </DeliverableSection>
      ) : null}

      {groups.audio.length > 0 ? (
        <DeliverableSection
          id={SECTIONS.audio}
          label="Audio"
          defaultOpen={shootSectionStartsOpen(closed, SECTIONS.audio)}
          layout={shootSectionLayout(listed, SECTIONS.audio)}
        >
          <ul>
            {groups.audio.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 border-b border-white/10 py-3 text-sm text-[#c7c7cc]"
              >
                <span className="min-w-0 truncate">{item.filename}</span>
                <a href={item.url} download={item.filename} className="shrink-0 text-white">
                  Download
                </a>
              </li>
            ))}
          </ul>
        </DeliverableSection>
      ) : null}

      {stills.length > 0 ? (
        <DeliverableSection
          id={SECTIONS.stills}
          label="Thumbnails"
          defaultOpen={shootSectionStartsOpen(closed, SECTIONS.stills)}
          layout={shootSectionLayout(listed, SECTIONS.stills)}
        >
          <StillLayout items={stills} basePath={basePath} contain={false} ratio="3/2" />
        </DeliverableSection>
      ) : null}

      <RawVideoSection videos={rawVideos} closed={closed} listed={listed} />

      {media.length === 0 ? <p className="text-sm text-[#8e8e93]">No files on this episode yet.</p> : null}

      {activeStill && viewId ? (
        <PhotoViewer
          photos={stills.map((item) => ({
            id: item.id,
            url: item.url,
            filename: item.filename,
            thumbUrl: item.thumbUrl,
          }))}
          initialId={viewId}
          basePath={basePath}
        />
      ) : null}
    </div>
  );
}

export const podcastTemplate: ContentTemplate = {
  Library: PodcastLibrary,
  AdminShoots: PodcastAdminShoots,
  Shoot: PodcastShoot,
};
