import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  assert.match(photos, /href="\/photos\/front\.jpg"/);
  assert.match(photos, /href="\/photos\/yard\.jpg"/);
});

test("floor plan tiles stay square", () => {
  const html = renderShoot();
  const plans = html.slice(html.indexOf('id="floor-plans"'));
  assert.match(plans, /aspect-square w-full object-contain/);
  assert.doesNotMatch(plans, /aspect-\[3\/2\]/);
});
