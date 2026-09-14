import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clampPhotoIndex,
  indexOfPhoto,
  photoViewerHref,
  preloadPhotoIndexes,
  resistedDrag,
  shouldRenderPhotoSlide,
  stepPhotoIndex,
  swipeStep,
  viewerCaption,
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

test("only mounts the active slide and its immediate neighbors", () => {
  assert.equal(shouldRenderPhotoSlide(4, 5), true);
  assert.equal(shouldRenderPhotoSlide(5, 5), true);
  assert.equal(shouldRenderPhotoSlide(6, 5), true);
  assert.equal(shouldRenderPhotoSlide(7, 5), false);
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

test("keeps filename and n / total in one caption", () => {
  assert.equal(viewerCaption("Full-01.jpg", 0, 38), "Full-01.jpg · 1 / 38");
});
