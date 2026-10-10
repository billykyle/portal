import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampPhotoIndex,
  indexOfPhoto,
  photoViewerHref,
  containedPhotoRect,
  placeContainedPhoto,
  preloadPhotoIndexes,
  preloadPhotoSrcs,
  resistedDrag,
  shouldPaintViewerImage,
  shouldRenderPhotoSlide,
  stepPhotoIndex,
  swipeStep,
  VIEWER_BACKDROP_OPACITY,
  VIEWER_CAPTION_GAP_PX,
  VIEWER_CAPTION_LINE_HEIGHT,
  VIEWER_Z_INDEX,
  viewerBackdropColor,
  viewerCaption,
  viewerCountLabel,
  viewerImageRatio,
  viewerLayerStyle,
  viewerPhotoFrameWidth,
  viewerOriginalSrc,
  viewerPlaceholderSrc,
} from "./photo-viewer";

const photos = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("builds a view query and a close href", () => {
  assert.equal(photoViewerHref("/shoots/1", "abc"), "/shoots/1?view=abc");
  assert.equal(photoViewerHref("/s/token"), "/s/token");
});

test("finds the opened photo and stays on the first when the id is unknown", () => {
  assert.equal(indexOfPhoto(photos, "b"), 1);
  assert.equal(indexOfPhoto(photos, "missing"), 0);
});

test("steps through the set without wrapping", () => {
  assert.equal(stepPhotoIndex(0, 3, 1), 1);
  assert.equal(stepPhotoIndex(2, 3, 1), 2);
  assert.equal(stepPhotoIndex(0, 3, -1), 0);
  assert.equal(clampPhotoIndex(-4, 3), 0);
  assert.equal(clampPhotoIndex(9, 3), 2);
  assert.equal(clampPhotoIndex(1, 0), 0);
});

test("preloads neighbors and one extra ahead", () => {
  assert.deepEqual(preloadPhotoIndexes(0, 38), [1, 2]);
  assert.deepEqual(preloadPhotoIndexes(5, 38), [4, 6, 7]);
  assert.deepEqual(preloadPhotoIndexes(37, 38), [36]);
});

test("lightbox and neighbor preload use the original, not the grid thumb", () => {
  const stills = [
    { id: "a", url: "/api/media/a", thumbUrl: "/api/media/a/thumb?v=111", filename: "a.jpg" },
    { id: "b", url: "/api/media/b", thumbUrl: "/api/media/b/thumb?v=222", filename: "b.jpg" },
    { id: "c", url: "/api/media/c", thumbUrl: "/api/media/c/thumb?v=333", filename: "c.jpg" },
    { id: "d", url: "/api/media/d", filename: "d.jpg" },
  ];
  assert.equal(viewerOriginalSrc(stills[0]), "/api/media/a");
  assert.equal(viewerPlaceholderSrc(stills[0]), "/api/media/a/thumb?v=111");
  assert.equal(viewerPlaceholderSrc({ url: "/api/media/a", thumbUrl: "/api/media/a" }), null);
  assert.equal(viewerPlaceholderSrc(stills[3]), null);
  assert.deepEqual(preloadPhotoSrcs(stills, 0), ["/api/media/b", "/api/media/c"]);
  assert.deepEqual(preloadPhotoSrcs(stills, 1), ["/api/media/a", "/api/media/c", "/api/media/d"]);
});

test("only the current photo is mounted", () => {
  assert.equal(shouldRenderPhotoSlide(5, 5), true);
  assert.equal(shouldRenderPhotoSlide(4, 5), false);
  assert.equal(shouldRenderPhotoSlide(6, 5), false);
  assert.equal(shouldPaintViewerImage("photo-29", "photo-29"), true);
  assert.equal(shouldPaintViewerImage("photo-28", "photo-29"), false);
});

test("each step moves exactly one photo", () => {
  let index = 0;
  for (let tap = 0; tap < 10; tap += 1) index = stepPhotoIndex(index, 40, 1);
  assert.equal(index, 10);
  assert.equal(stepPhotoIndex(27, 40, 1), 28);
  assert.equal(stepPhotoIndex(28, 40, 1), 29);
});

test("commits a swipe from distance or velocity", () => {
  assert.equal(swipeStep(-80, 200, 390), 1);
  assert.equal(swipeStep(80, 200, 390), -1);
  assert.equal(swipeStep(-40, 60, 390), 1);
  assert.equal(swipeStep(-10, 200, 390), 0);
  assert.equal(swipeStep(0, 100, 390), 0);
});

test("resists dragging past the first or last still", () => {
  assert.equal(resistedDrag(100, 0, 38), 25);
  assert.equal(resistedDrag(-100, 37, 38), -25);
  assert.equal(resistedDrag(-100, 5, 38), -100);
});

test("splits count and filename for the stacked header", () => {
  assert.equal(viewerCountLabel(8, 38), "9 / 38");
  assert.equal(viewerCaption("Full-09.jpg", 8, 38), "9 / 38, Full-09.jpg");
});

test("lightbox backdrop is solid 90% black with no blur", () => {
  assert.equal(VIEWER_BACKDROP_OPACITY, 0.9);
  assert.equal(viewerBackdropColor(), "rgb(0 0 0 / 0.9)");
  assert.equal(VIEWER_Z_INDEX, 60);
  assert.deepEqual(viewerLayerStyle(), {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100dvh",
    minHeight: "100dvh",
    zIndex: 60,
  });
});

test("filename line box sits fully above an object-contain frame", () => {
  assert.equal(VIEWER_CAPTION_LINE_HEIGHT, 1.5);
  assert.ok(VIEWER_CAPTION_LINE_HEIGHT >= 1.4);
  assert.equal(VIEWER_CAPTION_GAP_PX, 16);
  assert.ok(VIEWER_CAPTION_GAP_PX >= 14);
  assert.deepEqual(viewerImageRatio(3000, 2000), { width: 3000, height: 2000 });
  assert.equal(viewerImageRatio(0, 2000), null);
  assert.equal(viewerImageRatio(null, 2000), null);
  assert.equal(
    viewerPhotoFrameWidth(3000, 2000),
    "min(100cqw, calc(100cqh * 3000 / 2000))",
  );
  assert.equal(
    viewerPhotoFrameWidth(1080, 1620),
    "min(100cqw, calc(100cqh * 1080 / 1620))",
  );
  assert.equal(viewerPhotoFrameWidth(0, 100), null);

  const landscape = placeContainedPhoto(390, 700, 1600, 1000, 48);
  assert.ok(landscape);
  assert.ok(landscape.top >= 48);
  assert.ok(landscape.width <= 390 + 0.01);
  assert.ok(landscape.height > 180);
  assert.ok(Math.abs(landscape.width / landscape.height - 1.6) < 0.01);
  assert.ok(landscape.top + landscape.height <= 700 + 0.01);

  const portrait = placeContainedPhoto(390, 700, 1000, 1600, 48);
  assert.ok(portrait);
  assert.ok(portrait.top >= 48);
  assert.ok(Math.abs(portrait.width / portrait.height - 1000 / 1600) < 0.01);
  assert.equal(containedPhotoRect(0, 700, 1600, 1000), null);
  assert.equal(placeContainedPhoto(390, 40, 1600, 1000, 48), null);
});
