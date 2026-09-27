import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminShootPath,
  chooseShootSlug,
  clientShootPath,
  slugMatchesTitle,
  slugifyShootTitle,
  withSearch,
} from "./shoot-slug";

test("shoot titles become kebab-case slugs", () => {
  assert.equal(slugifyShootTitle("269 Pennock Bridge Road"), "269-pennock-bridge-road");
  assert.equal(slugifyShootTitle("  12 Wood View Drive, Princeton, NJ "), "12-wood-view-drive-princeton-nj");
  assert.equal(slugifyShootTitle("Tom & Jerry's"), "tom-and-jerry-s");
  assert.equal(slugifyShootTitle("---"), "shoot");
});

test("a slug is unique per client by date, then a number", () => {
  const taken = new Set<string>();
  const first = chooseShootSlug("269 Pennock Bridge Road", "2026-09-24", taken);
  taken.add(first);
  const second = chooseShootSlug("269 Pennock Bridge Road", "2026-10-02", taken);
  taken.add(second);
  const third = chooseShootSlug("269 Pennock Bridge Road", "2026-10-02", taken);
  assert.equal(first, "269-pennock-bridge-road");
  assert.equal(second, "269-pennock-bridge-road-2026-10-02");
  assert.equal(third, "269-pennock-bridge-road-2");
  assert.equal(slugMatchesTitle(first, "269 Pennock Bridge Road", "2026-09-24"), true);
  assert.equal(slugMatchesTitle(second, "269 Pennock Bridge Road", "2026-10-02"), true);
  assert.equal(slugMatchesTitle(third, "269 Pennock Bridge Road", "2026-10-02"), true);
  assert.equal(slugMatchesTitle(first, "16 Cove Road", "2026-09-24"), false);
});

test("client and admin shoot paths keep the slug", () => {
  assert.equal(clientShootPath("269-pennock-bridge-road"), "/my-content/269-pennock-bridge-road");
  assert.equal(
    adminShootPath("client-1", "269-pennock-bridge-road"),
    "/admin/clients/client-1/shoots/269-pennock-bridge-road",
  );
  assert.equal(withSearch("/my-content/269-pennock-bridge-road", "?view=photo-1"), "/my-content/269-pennock-bridge-road?view=photo-1");
  assert.equal(withSearch("/my-content/269-pennock-bridge-road", ""), "/my-content/269-pennock-bridge-road");
});
