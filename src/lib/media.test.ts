import assert from "node:assert/strict";
import { test } from "node:test";
import {
  guessMediaType,
  isPdfFilename,
  mediaLabel,
  mediaSectionId,
  resolveMediaThumbUrl,
  resolveMediaUrl,
} from "./media";

test("nas grid previews use the thumb route and downloads keep the original", () => {
  const previous = process.env.NAS_ENABLED;
  process.env.NAS_ENABLED = "true";
  try {
    const item = {
      id: "11111111-1111-1111-1111-111111111111",
      url: "/api/media/11111111-1111-1111-1111-111111111111",
      nasRelativePath: "/volume1/Final/Full-03.jpg",
    };
    assert.match(
      resolveMediaThumbUrl(item),
      /^\/api\/media\/11111111-1111-1111-1111-111111111111\/thumb\?v=[a-f0-9]{12}$/,
    );
    assert.equal(resolveMediaUrl(item), "/api/media/11111111-1111-1111-1111-111111111111");
    assert.notEqual(resolveMediaThumbUrl(item), resolveMediaUrl(item));
  } finally {
    if (previous === undefined) delete process.env.NAS_ENABLED;
    else process.env.NAS_ENABLED = previous;
  }
});

test("re-exports type detection used by the shoot page", () => {
  assert.equal(guessMediaType("tour.mov"), "video");
  assert.equal(mediaLabel("floor_plan"), "Floor plans");
  assert.equal(mediaSectionId("floor_plan"), "floor-plans");
  assert.equal(mediaSectionId("video"), "video");
  assert.equal(mediaSectionId("photo"), "photos");
  assert.equal(isPdfFilename("plan.PDF"), true);
  assert.equal(isPdfFilename("1st_floor.jpg"), false);
});
