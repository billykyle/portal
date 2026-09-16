import assert from "node:assert/strict";
import { test } from "node:test";
import { guessMediaType, isPdfFilename, mediaLabel, mediaSectionId } from "./media";

test("re-exports type detection used by the shoot page", () => {
  assert.equal(guessMediaType("tour.mov"), "video");
  assert.equal(mediaLabel("floor_plan"), "Floor plans");
  assert.equal(mediaSectionId("floor_plan"), "floor-plans");
  assert.equal(mediaSectionId("video"), "video");
  assert.equal(mediaSectionId("photo"), "photos");
  assert.equal(isPdfFilename("plan.PDF"), true);
  assert.equal(isPdfFilename("1st_floor.jpg"), false);
});
