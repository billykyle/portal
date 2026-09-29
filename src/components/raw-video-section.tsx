import { DeliverableSection } from "@/components/deliverable-section";
import { VideoLayout } from "@/components/video-layout";
import type { PlayerRendition } from "@/components/video-player";
import { mediaLabel, mediaSectionId } from "@/lib/media";
import { rawVideoHeaderDetail } from "@/lib/raw-video-size";
import { shootSectionLayout } from "@/lib/shoot-layout";
import { shootSectionStartsOpen } from "@/lib/shoot-sections";

export type RawVideoItem = {
  id: string;
  url: string;
  filename: string;
  width?: number | null;
  height?: number | null;
  byteSize?: number | null;
  renditions?: PlayerRendition[];
};

/** Jump link for the raw-video section. Null when the shoot has none, so the link stays hidden. */
export function rawVideoJump(count: number) {
  if (count <= 0) return null;
  return {
    id: mediaSectionId("raw_video"),
    label: mediaLabel("raw_video"),
    count,
  };
}

/**
 * Same player and per-file download as finished video.
 * Renditions are omitted so raw clips play and download the original file.
 */
export function RawVideoSection({
  videos,
  closed,
  listed,
}: {
  videos: RawVideoItem[];
  closed: ReadonlySet<string>;
  listed: ReadonlySet<string>;
}) {
  if (videos.length === 0) return null;
  const id = mediaSectionId("raw_video");
  return (
    <DeliverableSection
      id={id}
      label={mediaLabel("raw_video")}
      detail={rawVideoHeaderDetail(videos)}
      defaultOpen={shootSectionStartsOpen(closed, id)}
      layout={shootSectionLayout(listed, id)}
    >
      <VideoLayout
        items={videos.map((item) => ({
          id: item.id,
          url: item.url,
          filename: item.filename,
          width: item.width,
          height: item.height,
        }))}
        columns="pair"
      />
    </DeliverableSection>
  );
}
