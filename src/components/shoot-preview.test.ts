import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { listPreviewSrc } from "@/lib/list-preview";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";
import {
  parseListShootSections,
  serializeListShootSections,
  shootLayoutCookie,
  shootSectionLayout,
} from "@/lib/shoot-layout";
import { parseClosedShootSections, serializeClosedShootSections, shootSectionStartsOpen } from "@/lib/shoot-sections";
import { defaultTemplate } from "./templates/default-template";
import { podcastTemplate } from "./templates/podcast-template";
import { realEstateTemplate } from "./templates/real-estate-template";
import { ViewerStill } from "./photo-viewer";
import { ShootActions } from "./shoot-actions";
import { ShootDetail, type ShootMedia } from "./shoot-detail";

const media: ShootMedia[] = [
  {
    id: "photo-1",
    url: "/photos/front.jpg",
    thumbUrl: "/thumbs/front.jpg",
    filename: "front.jpg",
    type: "photo",
  },
  {
    id: "photo-2",
    url: "/photos/yard.jpg",
    thumbUrl: "/thumbs/yard.jpg",
    filename: "yard.jpg",
    type: "photo",
  },
  {
    id: "plan-1",
    url: "/plans/level-1.pdf",
    filename: "level-1.pdf",
    type: "floor_plan",
  },
];

function renderShoot() {
  return renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media,
    }),
  );
}

test("client shoot photo previews are 3:2 in a three-column mobile grid", () => {
  const html = renderShoot();
  assert.doesNotMatch(html, /Dropbox|Open Dropbox|dropbox/i);
  const photosStart = html.indexOf('id="photos"');
  const plansStart = html.indexOf('id="floor-plans"');
  assert.ok(photosStart >= 0 && plansStart > photosStart);
  const photos = html.slice(photosStart, plansStart);

  assert.match(photos, /class="grid grid-cols-3 gap-1\.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5 2xl:grid-cols-6"/);
  assert.doesNotMatch(photos, /size-12/);
  assert.doesNotMatch(photos, /grid-cols-1|grid-cols-2|sm:grid-cols-|md:grid-cols-/);
  assert.equal(photos.match(/aspect-\[3\/2\] w-full object-cover/g)?.length, 2);
  assert.doesNotMatch(photos, /aspect-square/);
  assert.match(photos, /src="\/thumbs\/front\.jpg"/);
  assert.match(photos, /src="\/thumbs\/yard\.jpg"/);
  assert.doesNotMatch(photos, /src="\/photos\/front\.jpg"/);
  assert.doesNotMatch(photos, /src="\/photos\/yard\.jpg"/);
  assert.match(photos, /href="\/photos\/front\.jpg"/);
  assert.match(photos, /href="\/photos\/yard\.jpg"/);
  assert.match(photos, /loading="eager"/);
});

test("photos past the first rows do not request a preview in the initial HTML", () => {
  const total = PREVIEW_EAGER_COUNT + 1;
  const many: ShootMedia[] = Array.from({ length: total }, (_, index) => ({
    id: `photo-${index}`,
    url: `/api/media/photo-${index}`,
    thumbUrl: `/api/media/photo-${index}/thumb`,
    filename: `Full-${String(index + 1).padStart(2, "0")}.jpg`,
    type: "photo",
  }));
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "900 Ocean Drive Unit 1502",
      dateLabel: "Sep 11, 2026",
      folderName: "2026-09-11-900-ocean-drive",
      media: many,
    }),
  );
  const photos = html.slice(html.indexOf('id="photos"'));
  assert.equal(photos.match(/src="\/api\/media\/photo-\d+\/thumb"/g)?.length, PREVIEW_EAGER_COUNT);
  assert.doesNotMatch(photos, new RegExp(`src="/api/media/photo-${PREVIEW_EAGER_COUNT}/thumb"`));
  assert.match(photos, new RegExp(`href="/api/media/photo-${PREVIEW_EAGER_COUNT}"`));
  assert.match(photos, /loading="eager"/);
  assert.equal(photos.match(/loading="eager"/g)?.length, PREVIEW_EAGER_COUNT);
});

test("opening a photo shows the original above the grid thumb", () => {
  const html = renderToStaticMarkup(
    createElement(ViewerStill, {
      active: true,
      photo: {
        id: "photo-1",
        url: "/api/media/photo-1",
        thumbUrl: "/api/media/photo-1/thumb?v=abc123",
        filename: "Full-01.jpg",
      },
    }),
  );
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  const srcOf = (tag: string) => tag.match(/src="([^"]*)"/)?.[1];
  const original = images.find((tag) => srcOf(tag) === "/api/media/photo-1");
  const preview = images.find((tag) => srcOf(tag) === "/api/media/photo-1/thumb?v=abc123");
  assert.ok(original);
  assert.ok(preview);
  assert.match(original, /z-10/);
  assert.match(preview, /z-0/);
  assert.doesNotMatch(original, /\/thumb/);
  assert.match(original, /alt="Full-01\.jpg"/);

  const grid = renderShoot();
  const photos = grid.slice(grid.indexOf('id="photos"'), grid.indexOf('id="floor-plans"'));
  assert.match(photos, /src="\/thumbs\/front\.jpg"/);
  assert.match(photos, /href="\/shoots\/shoot-1\?view=photo-1"/);
  assert.doesNotMatch(photos, /src="\/photos\/front\.jpg"/);
});

test("a photo with no separate thumb does not stack a preview in the viewer", () => {
  const html = renderToStaticMarkup(
    createElement(ViewerStill, {
      active: true,
      photo: { id: "photo-1", url: "/photos/front.jpg", filename: "front.jpg" },
    }),
  );
  const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(images.length, 1);
  assert.match(images[0], /src="\/photos\/front\.jpg"/);
  assert.match(images[0], /z-10/);
});

test("tapping a photo opens it in the page above the grid", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      viewId: "photo-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media,
    }),
  );
  assert.doesNotMatch(html, /fixed inset-0|role="dialog"|aria-modal/);
  const photos = html.slice(html.indexOf('id="photos"'), html.indexOf('id="floor-plans"'));
  const viewerAt = photos.indexOf("data-photo-viewer");
  const gridAt = photos.indexOf("grid-cols-3");
  assert.ok(viewerAt >= 0 && gridAt > viewerAt);
  const viewer = photos.slice(viewerAt, gridAt);
  assert.match(viewer, /src="\/photos\/front\.jpg"/);
  assert.match(viewer, /alt="front\.jpg"/);
  assert.match(viewer, /z-10/);
  assert.match(viewer, /aria-label="Other photos"/);
  assert.match(viewer, /aria-label="yard\.jpg"/);
  assert.match(viewer, /src="\/thumbs\/yard\.jpg"/);
  assert.doesNotMatch(viewer, /aria-label="front\.jpg"/);
  assert.match(viewer, /href="\/photos\/front\.jpg"[^>]*download="front\.jpg"|download="front\.jpg"[^>]*href="\/photos\/front\.jpg"/);
  assert.doesNotMatch(viewer, /href="\/thumbs\//);
  assert.match(photos, /grid-cols-3/);
  assert.match(photos, /src="\/thumbs\/front\.jpg"/);
  assert.match(photos, /href="\/shoots\/shoot-1\?view=photo-2"/);

  const nas = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/s/token",
      viewId: "photo-a",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: [
        {
          id: "photo-a",
          url: "/api/media/photo-a",
          thumbUrl: "/api/media/photo-a/thumb?v=abc",
          filename: "Full-01.jpg",
          type: "photo",
          width: 3000,
          height: 2000,
        },
        {
          id: "photo-b",
          url: "/api/media/photo-b",
          thumbUrl: "/api/media/photo-b/thumb?v=def",
          filename: "Full-02.jpg",
          type: "photo",
        },
      ],
    }),
  );
  const nasViewer = nas.slice(nas.indexOf("data-photo-viewer"), nas.indexOf("grid-cols-3"));
  assert.match(nasViewer, /aspect-ratio:\s*3000\s*\/\s*2000/);
  assert.match(nasViewer, /href="\/api\/media\/photo-a\?download=1"/);
  assert.match(nasViewer, /download="Full-01\.jpg"/);
  assert.doesNotMatch(nasViewer, /href="[^"]*\/thumb/);
  assert.match(nasViewer, /aria-label="Full-02\.jpg"/);

  const construction = renderToStaticMarkup(
    createElement(defaultTemplate.Shoot, {
      basePath: "/admin/clients/1/shoots/harbor",
      viewId: "photo-1",
      address: "14 Harbor Lane",
      dateLabel: "Sep 12, 2026",
      folderName: "2026-09-12 - 14 Harbor Lane",
      media: media.map((item, index) => ({ ...item, sortOrder: index })),
    }),
  );
  const constructionPhotos = construction.slice(
    construction.indexOf('id="photos"'),
    construction.indexOf('id="floor-plans"'),
  );
  assert.match(constructionPhotos, /data-photo-viewer/);
  assert.match(constructionPhotos, /src="\/photos\/front\.jpg"/);
  assert.match(constructionPhotos, /grid-cols-3/);
  assert.doesNotMatch(construction, /fixed inset-0/);

  const episode = renderToStaticMarkup(
    createElement(podcastTemplate.Shoot, {
      basePath: "/my-content/harbor",
      viewId: "still-1",
      address: "Episode 4 with Jonah Hale",
      dateLabel: "Sep 12, 2026",
      folderName: "2026-09-12 - Episode 4",
      media: [
        {
          id: "still-1",
          url: "/photos/cover.jpg",
          thumbUrl: "/thumbs/cover.jpg",
          filename: "cover.jpg",
          type: "photo",
          sortOrder: 0,
        },
        {
          id: "still-2",
          url: "/photos/guest.jpg",
          thumbUrl: "/thumbs/guest.jpg",
          filename: "guest.jpg",
          type: "photo",
          sortOrder: 1,
        },
      ],
    }),
  );
  const stills = episode.slice(episode.indexOf('id="thumbnails"'));
  const episodeViewer = stills.slice(stills.indexOf("data-photo-viewer"), stills.indexOf("grid-cols-3"));
  assert.match(episodeViewer, /src="\/photos\/cover\.jpg"/);
  assert.match(episodeViewer, /aria-label="guest\.jpg"/);
  assert.match(episodeViewer, /href="\/photos\/cover\.jpg"/);
  assert.match(stills, /grid-cols-3/);
  assert.doesNotMatch(episode, /fixed inset-0|role="dialog"/);
});

test("opening a floor plan shows the original file", () => {
  const plans: ShootMedia[] = [
    {
      id: "plan-pdf",
      url: "/api/media/plan-pdf",
      thumbUrl: "/api/media/plan-pdf/thumb?v=aaa",
      filename: "level-1.pdf",
      type: "floor_plan",
    },
    {
      id: "plan-jpg",
      url: "/api/media/plan-jpg",
      thumbUrl: "/api/media/plan-jpg/thumb?v=bbb",
      filename: "1st_floor.jpg",
      type: "floor_plan",
    },
  ];
  const pdf = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/s/token",
      viewId: "plan-pdf",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: plans,
    }),
  );
  const pdfViewer = pdf.slice(pdf.indexOf("fixed inset-0"));
  assert.match(pdfViewer, /<iframe[^>]*src="\/api\/media\/plan-pdf"/);
  assert.doesNotMatch(pdfViewer, /\/thumb/);
  assert.match(pdfViewer, /href="\/api\/media\/plan-pdf"/);

  const jpg = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      viewId: "plan-jpg",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: plans,
    }),
  );
  const tiles = jpg.slice(jpg.indexOf('id="floor-plans"'), jpg.indexOf("fixed inset-0"));
  const viewer = jpg.slice(jpg.indexOf("fixed inset-0"));
  assert.match(tiles, /src="\/api\/media\/plan-jpg\/thumb\?v=bbb"/);
  assert.match(viewer, /<img[^>]*src="\/api\/media\/plan-jpg"/);
  assert.doesNotMatch(viewer, /\/thumb/);
  assert.match(viewer, /href="\/api\/media\/plan-jpg"/);
});

test("shoot video uses an in-page player with a browser-playable type", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "188 33rd Street",
      dateLabel: "Aug 19, 2026",
      folderName: "2026-08-19-188-33rd",
      media: [
        {
          id: "vid-1",
          url: "/api/media/vid-1",
          filename: "188 33rd Street.mov",
          type: "video",
        },
      ],
    }),
  );
  const video = html.slice(html.indexOf('id="video"'));
  assert.match(video, /<video\b[^>]*controls/);
  assert.match(video, /playsInline|playsinline/);
  assert.match(video, /preload="metadata"/);
  assert.match(video, /<source[^>]*src="\/api\/media\/vid-1"/);
  assert.match(video, /type="video\/mp4"/);
  assert.doesNotMatch(video, /video\/quicktime/);
  assert.doesNotMatch(video, /aspect-video/);
  assert.doesNotMatch(video, /Playback quality|1080p|720p|>Original</);
  assert.match(video, /href="\/api\/media\/vid-1"/);
  assert.doesNotMatch(video, /href="[^"]*rendition=/);
});

test("videos play at their own ratio and default to a lighter rendition", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "1843 Beacon Hill Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-beacon-hill",
      media: [
        {
          id: "tall",
          url: "/api/media/tall",
          filename: "1843 Beacon Hill Drive - captions.mov",
          type: "video",
          width: 1080,
          height: 1920,
          renditions: [
            { quality: "720", url: "/api/media/tall?rendition=720" },
            { quality: "1080", url: "/api/media/tall?rendition=1080" },
          ],
        },
        {
          id: "wide",
          url: "/api/media/wide",
          filename: "walkthrough.mp4",
          type: "video",
          width: 1920,
          height: 1080,
          renditions: [{ quality: "720", url: "/api/media/wide?rendition=720" }],
        },
      ],
    }),
  );
  const video = html.slice(html.indexOf('id="video"'));
  assert.match(video, /aspect-ratio:\s*1080\s*\/\s*1920/);
  assert.match(video, /aspect-ratio:\s*1920\s*\/\s*1080/);
  assert.doesNotMatch(video, /aspect-video/);
  assert.match(video, /<source[^>]*src="\/api\/media\/tall\?rendition=720"/);
  assert.match(video, /<source[^>]*src="\/api\/media\/wide\?rendition=720"/);
  assert.match(video, /href="\/api\/media\/tall"/);
  assert.match(video, /href="\/api\/media\/wide"/);
  assert.doesNotMatch(video, /href="[^"]*rendition=/);
  assert.doesNotMatch(video, /<select|Playback quality|1080p|>Original</);
  const photos = html.indexOf('id="photos"');
  assert.equal(photos, -1);
});

test("closed shoot sections are remembered per type and default open", () => {
  assert.equal(shootSectionStartsOpen(parseClosedShootSections(null), "photos"), true);
  assert.equal(shootSectionStartsOpen(parseClosedShootSections("floor-plans"), "photos"), true);
  assert.equal(shootSectionStartsOpen(parseClosedShootSections("floor-plans,video"), "floor-plans"), false);
  assert.equal(serializeClosedShootSections(["video", "photos"]), "photos,video");
  assert.equal(shootSectionStartsOpen(parseClosedShootSections(serializeClosedShootSections(["photos"])), "photos"), false);
});

test("a closed deliverable section stays in the jump list and skips its thumbnails", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media,
      closedSectionIds: ["floor-plans"],
    }),
  );
  assert.match(html, /href="#photos"/);
  assert.match(html, /href="#floor-plans"/);
  assert.match(html, /Photos \(2\)/);
  assert.match(html, /Floor plans \(1\)/);
  const photos = html.slice(html.indexOf('id="photos"'), html.indexOf('id="floor-plans"'));
  const plans = html.slice(html.indexOf('id="floor-plans"'));
  assert.match(photos, /aria-expanded="true"/);
  assert.match(photos, /src="\/thumbs\/front\.jpg"/);
  assert.match(plans, /aria-expanded="false"/);
  assert.doesNotMatch(plans, /src="\/plans\/level-1\.pdf"/);
  assert.doesNotMatch(plans, /<img\b/);
});

const mixedMedia: ShootMedia[] = [
  ...media,
  {
    id: "vid-1",
    url: "/api/media/vid-1",
    filename: "walkthrough.mp4",
    thumbUrl: "/api/media/vid-1/thumb",
    type: "video",
    width: 1920,
    height: 1080,
    renditions: [{ quality: "720", url: "/api/media/vid-1?rendition=720" }],
  },
  {
    id: "raw-1",
    url: "/api/media/raw-1",
    filename: "Raw Video/A001.mov",
    type: "raw_video",
    width: 3840,
    height: 2160,
    byteSize: Math.round(2.1 * 1024 * 1024 * 1024),
  },
  {
    id: "raw-2",
    url: "/api/media/raw-2",
    filename: "Raw Video/A002.mov",
    type: "raw_video",
    byteSize: Math.round(2.1 * 1024 * 1024 * 1024),
  },
];

function sectionOrder(html: string) {
  return ["photos", "floor-plans", "video", "raw-video"].filter((id) => html.includes(`id="${id}"`));
}

test("raw video is a last section with a jump link, and it is hidden when absent", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: mixedMedia,
    }),
  );
  assert.deepEqual(sectionOrder(html), ["photos", "floor-plans", "video", "raw-video"]);
  const jumps = html.slice(html.indexOf('aria-label="Media on this shoot"'), html.indexOf('id="photos"'));
  assert.match(jumps, /Photos \(2\)/);
  assert.match(jumps, /Floor plans \(1\)/);
  assert.match(jumps, /Video \(1\)/);
  assert.match(jumps, /Raw video \(2\)/);
  assert.doesNotMatch(jumps, /files ·|GB/);
  assert.ok(jumps.indexOf("Video (1)") < jumps.indexOf("Raw video (2)"));
  assert.ok(jumps.lastIndexOf("Raw video (2)") > jumps.lastIndexOf("Floor plans (1)"));
  const raw = html.slice(html.indexOf('id="raw-video"'));
  assert.match(raw, /aria-expanded="true"/);
  assert.match(raw, />Raw video</);
  assert.match(raw, /2 files · 4\.2 GB/);
  assert.doesNotMatch(html.slice(0, html.indexOf('id="raw-video"')), /files ·/);
  assert.match(raw, /<source[^>]*src="\/api\/media\/raw-1"/);
  assert.match(raw, /<source[^>]*src="\/api\/media\/raw-2"/);
  assert.match(raw, /href="\/api\/media\/raw-1"/);
  assert.match(raw, /href="\/api\/media\/raw-2"/);
  assert.doesNotMatch(raw, /rendition=|Playback quality|<select|>Original</);
  const finished = html.slice(html.indexOf('id="video"'), html.indexOf('id="raw-video"'));
  assert.match(finished, /src="\/api\/media\/vid-1\?rendition=720"/);
  assert.doesNotMatch(renderShoot(), /Raw video|id="raw-video"/);
});

test("a closed raw video section stays in the jump list and skips its players", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: mixedMedia,
      closedSectionIds: ["raw-video"],
    }),
  );
  assert.match(html, /href="#raw-video"/);
  assert.match(html, /Raw video \(2\)/);
  const raw = html.slice(html.indexOf('id="raw-video"'));
  assert.match(raw, /2 files · 4\.2 GB/);
  assert.match(raw, /aria-expanded="false"/);
  assert.doesNotMatch(raw, /<video\b|<source\b/);
});

test("real estate, default, and podcast layouts pin raw video last", () => {
  const shared = {
    basePath: "/my-content/harbor",
    address: "14 Harbor Lane",
    dateLabel: "Sep 12, 2026",
    folderName: "2026-09-12 - 14 Harbor Lane",
    media: mixedMedia.map((item, index) => ({ ...item, sortOrder: index })),
  };
  const realEstate = renderToStaticMarkup(createElement(realEstateTemplate.Shoot, shared));
  const construction = renderToStaticMarkup(createElement(defaultTemplate.Shoot, shared));
  assert.deepEqual(sectionOrder(realEstate), ["photos", "floor-plans", "video", "raw-video"]);
  assert.deepEqual(sectionOrder(construction), ["photos", "floor-plans", "video", "raw-video"]);
  assert.match(realEstate, /Raw video \(2\)/);
  assert.match(construction, /Raw video \(2\)/);
  assert.match(realEstate, /2 files · 4\.2 GB/);
  assert.match(construction, /2 files · 4\.2 GB/);
  assert.doesNotMatch(realEstate.slice(0, realEstate.indexOf('id="raw-video"')), /files ·/);
  assert.doesNotMatch(construction.slice(0, construction.indexOf('id="raw-video"')), /files ·/);

  const episode = renderToStaticMarkup(
    createElement(podcastTemplate.Shoot, {
      ...shared,
      address: "Episode 4 with Jonah Hale",
      media: [
        {
          id: "full",
          url: "/api/media/full",
          filename: "full-episode.mp4",
          type: "video" as const,
          sortOrder: 0,
          width: 1920,
          height: 1080,
        },
        {
          id: "clip",
          url: "/api/media/clip",
          filename: "clip.mp4",
          type: "video" as const,
          sortOrder: 1,
          width: 1080,
          height: 1920,
        },
        {
          id: "still",
          url: "/thumbs/cover.jpg",
          filename: "cover.jpg",
          type: "photo" as const,
          sortOrder: 2,
        },
        {
          id: "raw-1",
          url: "/api/media/raw-1",
          filename: "Raw Video/A001.mov",
          type: "raw_video" as const,
          sortOrder: 3,
          byteSize: 800 * 1024 * 1024,
        },
      ],
    }),
  );
  const fullAt = episode.indexOf('id="full-episode"');
  const clipsAt = episode.indexOf('id="clips"');
  const stillsAt = episode.indexOf('id="thumbnails"');
  const rawAt = episode.indexOf('id="raw-video"');
  assert.ok(fullAt >= 0 && clipsAt > fullAt && stillsAt > clipsAt && rawAt > stillsAt);
  assert.match(episode, /Raw video \(1\)/);
  assert.match(episode.slice(rawAt), /1 file · 800 MB/);
  assert.doesNotMatch(episode.slice(0, rawAt), /files ·|file ·/);
  const clips = episode.slice(clipsAt, stillsAt);
  assert.doesNotMatch(clips, /Raw Video\/A001/);
  assert.doesNotMatch(
    renderToStaticMarkup(
      createElement(podcastTemplate.Shoot, {
        ...shared,
        media: shared.media.filter((item) => item.type !== "raw_video"),
      }),
    ),
    /Raw video|id="raw-video"/,
  );
});

test("layout is remembered per section type and defaults to grid", () => {
  assert.equal(shootSectionLayout(parseListShootSections(null), "photos"), "grid");
  assert.equal(shootSectionLayout(parseListShootSections("photos"), "floor-plans"), "grid");
  assert.equal(shootSectionLayout(parseListShootSections("photos,raw-video"), "photos"), "list");
  assert.equal(shootSectionLayout(parseListShootSections("photos,raw-video"), "raw-video"), "list");
  assert.equal(serializeListShootSections(["video", "photos"]), "photos,video");
  assert.equal(
    shootSectionLayout(parseListShootSections(serializeListShootSections(["clips"])), "clips"),
    "list",
  );
  assert.match(shootLayoutCookie("photos", true), /^bk_shoot_layout=photos; Path=\/; Max-Age=\d+; SameSite=Lax; Secure$/);
  assert.equal(shootLayoutCookie("", false), "bk_shoot_layout=; Path=/; Max-Age=0; SameSite=Lax");
});

test("list view is rows for stills and a playable file row for video", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: mixedMedia,
      listSectionIds: ["photos", "floor-plans", "video", "raw-video"],
    }),
  );
  assert.deepEqual(sectionOrder(html), ["photos", "floor-plans", "video", "raw-video"]);
  const jumps = html.slice(html.indexOf('aria-label="Media on this shoot"'), html.indexOf('id="photos"'));
  assert.match(jumps, /Photos \(2\)/);
  assert.match(jumps, /Raw video \(2\)/);
  assert.doesNotMatch(jumps, /files ·|GB/);

  const photos = html.slice(html.indexOf('id="photos"'), html.indexOf('id="floor-plans"'));
  assert.match(photos, /data-layout="list"/);
  assert.match(photos, /aria-pressed="false"[^>]*>Grid</);
  assert.match(photos, /aria-pressed="true"[^>]*>List</);
  assert.match(photos, />front\.jpg</);
  assert.match(photos, /href="\/shoots\/shoot-1\?view=photo-1"/);
  assert.match(photos, /href="\/photos\/front\.jpg"/);
  assert.match(photos, /size-12/);
  assert.match(photos, /src="\/thumbs\/front\.jpg"/);
  assert.match(photos, /src="\/thumbs\/yard\.jpg"/);
  assert.doesNotMatch(photos, /grid-cols-3|aspect-\[3\/2\]/);

  const plans = html.slice(html.indexOf('id="floor-plans"'), html.indexOf('id="video"'));
  assert.match(plans, /data-layout="list"/);
  assert.match(plans, />level-1\.pdf</);
  assert.match(plans, /href="\/plans\/level-1\.pdf"/);
  assert.match(plans, /size-12/);
  assert.doesNotMatch(plans, /<img\b|aspect-square|grid-cols-3/);

  const video = html.slice(html.indexOf('id="video"'), html.indexOf('id="raw-video"'));
  assert.match(video, /data-layout="list"/);
  assert.match(video, />walkthrough\.mp4</);
  assert.match(video, />Play</);
  assert.match(video, /size-12/);
  assert.match(video, /src="\/api\/media\/vid-1\/thumb"/);
  assert.match(video, /<video\b[^>]*controls/);
  assert.match(video, /<source[^>]*src="\/api\/media\/vid-1\?rendition=720"/);
  assert.match(video, /href="\/api\/media\/vid-1"/);
  assert.doesNotMatch(video, /lg:grid-cols-2|href="[^"]*rendition=/);

  const raw = html.slice(html.indexOf('id="raw-video"'));
  assert.match(raw, /data-layout="list"/);
  assert.match(raw, /size-12/);
  assert.doesNotMatch(raw, /<img\b/);
  assert.match(raw, /2 files · 4\.2 GB/);
  assert.match(raw, />Raw Video\/A001\.mov</);
  assert.match(raw, />Play</);
  assert.match(raw, /<source[^>]*src="\/api\/media\/raw-1"/);
  assert.match(raw, /href="\/api\/media\/raw-1"/);
  assert.doesNotMatch(raw, /lg:grid-cols-2|rendition=/);

  const empty = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: [],
      listSectionIds: ["photos", "floor-plans", "video", "raw-video", "audio", "thumbnails"],
    }),
  );
  assert.doesNotMatch(empty, /id="photos"|id="floor-plans"|id="video"|id="raw-video"|Grid|List/);
  assert.match(empty, /No files on this shoot yet/);
});

test("one section can be a list while the others stay on the grid", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "12 Wood View Drive",
      dateLabel: "Sep 4, 2026",
      folderName: "2026-09-04-12-wood-view",
      media: mixedMedia,
      listSectionIds: ["photos"],
    }),
  );
  const photos = html.slice(html.indexOf('id="photos"'), html.indexOf('id="floor-plans"'));
  const plans = html.slice(html.indexOf('id="floor-plans"'), html.indexOf('id="video"'));
  const video = html.slice(html.indexOf('id="video"'), html.indexOf('id="raw-video"'));
  const raw = html.slice(html.indexOf('id="raw-video"'));
  assert.match(photos, /data-layout="list"/);
  assert.match(photos, /size-12/);
  assert.match(photos, /src="\/thumbs\/front\.jpg"/);
  assert.doesNotMatch(photos, /grid-cols-3/);
  assert.match(plans, /data-layout="grid"/);
  assert.doesNotMatch(plans, /size-12/);
  assert.match(plans, /aspect-square/);
  assert.match(video, /data-layout="grid"/);
  assert.match(video, /lg:grid lg:grid-cols-2/);
  assert.doesNotMatch(video, />Play</);
  assert.match(raw, /data-layout="grid"/);
  assert.match(raw, /2 files · 4\.2 GB/);
  assert.match(raw, /lg:grid lg:grid-cols-2/);
});

test("podcast sections switch between the current layout and a file list", () => {
  const shared = {
    basePath: "/my-content/harbor",
    address: "Episode 4 with Jonah Hale",
    dateLabel: "Sep 12, 2026",
    folderName: "2026-09-12 - Episode 4",
    media: [
      {
        id: "full",
        url: "/api/media/full",
        filename: "full-episode.mp4",
        type: "video" as const,
        sortOrder: 0,
        width: 1920,
        height: 1080,
      },
      {
        id: "clip",
        url: "/api/media/clip",
        filename: "clip.mp4",
        type: "video" as const,
        sortOrder: 1,
        width: 1080,
        height: 1920,
      },
      {
        id: "audio-1",
        url: "/api/media/audio-1",
        filename: "episode.mp3",
        type: "audio" as const,
        sortOrder: 2,
      },
      {
        id: "still",
        url: "/thumbs/cover.jpg",
        filename: "cover.jpg",
        type: "photo" as const,
        sortOrder: 3,
      },
    ],
  };
  const grid = renderToStaticMarkup(createElement(podcastTemplate.Shoot, shared));
  const full = grid.slice(grid.indexOf('id="full-episode"'), grid.indexOf('id="clips"'));
  const clips = grid.slice(grid.indexOf('id="clips"'), grid.indexOf('id="audio"'));
  const audio = grid.slice(grid.indexOf('id="audio"'), grid.indexOf('id="thumbnails"'));
  const stills = grid.slice(grid.indexOf('id="thumbnails"'));
  assert.match(full, /data-layout="grid"/);
  assert.match(full, /<video\b/);
  assert.doesNotMatch(full, />Play</);
  assert.match(clips, /grid-cols-3 items-start/);
  assert.match(audio, /data-layout="grid"/);
  assert.match(audio, />episode\.mp3</);
  assert.match(audio, /href="\/api\/media\/audio-1"/);
  assert.doesNotMatch(audio, /size-12/);
  assert.match(stills, /grid-cols-3/);
  assert.doesNotMatch(grid, /id="raw-video"/);

  const listed = renderToStaticMarkup(
    createElement(podcastTemplate.Shoot, {
      ...shared,
      listSectionIds: ["full-episode", "clips", "audio", "thumbnails"],
    }),
  );
  const listedFull = listed.slice(listed.indexOf('id="full-episode"'), listed.indexOf('id="clips"'));
  const listedClips = listed.slice(listed.indexOf('id="clips"'), listed.indexOf('id="audio"'));
  const listedAudio = listed.slice(listed.indexOf('id="audio"'), listed.indexOf('id="thumbnails"'));
  const listedStills = listed.slice(listed.indexOf('id="thumbnails"'));
  assert.match(listedFull, /data-layout="list"/);
  assert.match(listedFull, />full-episode\.mp4</);
  assert.match(listedFull, />Play</);
  assert.match(listedFull, /<video\b/);
  assert.match(listedClips, /data-layout="list"/);
  assert.match(listedClips, />clip\.mp4</);
  assert.match(listedClips, />Play</);
  assert.doesNotMatch(listedClips, /grid-cols-3/);
  assert.match(listedAudio, /data-layout="list"/);
  assert.match(listedAudio, />episode\.mp3</);
  assert.match(listedAudio, /href="\/api\/media\/audio-1"/);
  assert.match(listedAudio, /size-12/);
  assert.doesNotMatch(listedAudio, /<img\b/);
  assert.match(listedFull, /size-12/);
  assert.doesNotMatch(listedFull, /<img\b/);
  assert.match(listedStills, /data-layout="list"/);
  assert.match(listedStills, />cover\.jpg</);
  assert.match(listedStills, /size-12/);
  assert.match(listedStills, /src="\/thumbs\/cover\.jpg"/);
  assert.doesNotMatch(listedStills, /grid-cols-3/);
});

test("a list row uses a low-res thumb and leaves files without one blank", () => {
  assert.equal(listPreviewSrc({ url: "/photos/front.jpg", thumbUrl: "/thumbs/front.jpg" }), "/thumbs/front.jpg");
  assert.equal(listPreviewSrc({ url: "/api/media/vid-1", thumbUrl: "/api/media/vid-1/thumb?v=abc" }), "/api/media/vid-1/thumb?v=abc");
  assert.equal(listPreviewSrc({ url: "/photos/front.jpg" }), "/photos/front.jpg");
  assert.equal(listPreviewSrc({ url: "/api/media/vid-1", thumbUrl: "/api/media/vid-1" }), null);
  assert.equal(listPreviewSrc({ url: "/plans/level-1.pdf" }), null);
  assert.equal(listPreviewSrc({ url: "/api/media/audio-1", filename: "episode.mp3" } as { url: string }), null);
});

test("shoot pages copy the public link and do not offer Share", () => {
  const html = renderToStaticMarkup(
    createElement(ShootActions, {
      files: [{ url: "/api/media/1", filename: "front.jpg", type: "photo" }],
      folderName: "2026-09-04-12-wood-view",
      shareToken: "public-token",
    }),
  );
  assert.match(html, />Copy link</);
  assert.doesNotMatch(html, />Share</);

  const actions = readFileSync("src/components/shoot-actions.tsx", "utf8");
  assert.match(actions, /publicShootPath\(shareToken/);
  assert.doesNotMatch(actions, /navigator\.share/);

  const client = readFileSync("src/app/my-content/[slug]/page.tsx", "utf8");
  const admin = readFileSync("src/app/admin/clients/[id]/shoots/[slug]/page.tsx", "utf8");
  assert.match(client, /ShootScreen/);
  assert.match(admin, /ShootScreen/);
  const screen = readFileSync("src/components/shoot-screen.tsx", "utf8");
  assert.match(screen, /shareToken=\{shoot\.publicToken\}/);

  const publicPage = readFileSync("src/app/s/[token]/page.tsx", "utf8");
  assert.match(publicPage, /getPublicShoot/);
  assert.doesNotMatch(publicPage, /getSession|getAdminSession|redirect\(/);
  const middleware = readFileSync("src/middleware.ts", "utf8");
  assert.doesNotMatch(middleware, /pathname\.startsWith\("\/s"\)/);
});

test("floor plan tiles stay square", () => {
  const html = renderShoot();
  const plans = html.slice(html.indexOf('id="floor-plans"'));
  assert.match(plans, /aspect-square w-full object-contain/);
  assert.doesNotMatch(plans, /aspect-\[3\/2\]/);
});
