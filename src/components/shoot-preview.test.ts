import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PREVIEW_EAGER_COUNT } from "@/lib/preview-queue";
import { ViewerStill } from "./photo-viewer";
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
      dropboxUrl: null,
      folderName: "2026-09-04-12-wood-view",
      media,
    }),
  );
}

test("client shoot photo previews are 3:2 in a three-column mobile grid", () => {
  const html = renderShoot();
  const photosStart = html.indexOf('id="photos"');
  const plansStart = html.indexOf('id="floor-plans"');
  assert.ok(photosStart >= 0 && plansStart > photosStart);
  const photos = html.slice(photosStart, plansStart);

  assert.match(photos, /class="grid grid-cols-3 gap-1\.5 lg:grid-cols-4 lg:gap-2 xl:grid-cols-5 2xl:grid-cols-6"/);
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
      dropboxUrl: null,
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
      dropboxUrl: null,
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
      dropboxUrl: null,
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
      dropboxUrl: null,
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
  assert.match(video, /aria-label="Playback quality"/);
  assert.match(video, /href="\/api\/media\/vid-1"/);
  assert.doesNotMatch(video, /href="[^"]*rendition=/);
});

test("videos play at their own ratio and default to a lighter rendition", () => {
  const html = renderToStaticMarkup(
    createElement(ShootDetail, {
      basePath: "/shoots/shoot-1",
      address: "1843 Beacon Hill Drive",
      dateLabel: "Sep 4, 2026",
      dropboxUrl: null,
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
  assert.match(video, />Auto · 720p</);
  assert.match(video, />1080p</);
  assert.match(video, />Original</);
  const photos = html.indexOf('id="photos"');
  assert.equal(photos, -1);
});

test("floor plan tiles stay square", () => {
  const html = renderShoot();
  const plans = html.slice(html.indexOf('id="floor-plans"'));
  assert.match(plans, /aspect-square w-full object-contain/);
  assert.doesNotMatch(plans, /aspect-\[3\/2\]/);
});
