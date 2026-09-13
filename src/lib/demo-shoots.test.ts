import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPlaceholderMediaUrl,
  isPortalOnlyDemoShoot,
  mediaFilenamesMissingFromNas,
  shouldCreatePortalShoot,
  shouldPruneShootsMissingFromNas,
} from "./demo-shoots";

test("flags Whitfield seed shoots and /samples/ files as demo", () => {
  assert.equal(
    isPortalOnlyDemoShoot({
      address: "1847 Maple Avenue, Austin, TX",
      nasRelativePath: "Whitfield/2026-09-04 - 1847 Maple Avenue, Austin, TX",
    }),
    true,
  );
  assert.equal(isPlaceholderMediaUrl("/samples/maple-exterior.jpg"), true);
  assert.equal(isPlaceholderMediaUrl("/api/media/abc"), false);
});

test("keeps a NAS-backed shoot without sample files", () => {
  assert.equal(
    isPortalOnlyDemoShoot({
      address: "12 Wood View Drive",
      nasRelativePath: "Sam Lepore/2026.09.04 - 12 Wood View Drive",
      mediaUrls: ["/api/media/1"],
    }),
    false,
  );
});

test("lists portal files that are not on NAS", () => {
  assert.deepEqual(
    mediaFilenamesMissingFromNas(
      [{ filename: "Full-01.jpg" }, { filename: "01-exterior.jpg" }],
      new Set(["Full-01.jpg"]),
    ),
    ["01-exterior.jpg"],
  );
});

test("refuses orphan prune when the share walk returned no client folders", () => {
  assert.equal(shouldPruneShootsMissingFromNas(0), false);
  assert.equal(shouldPruneShootsMissingFromNas(2), true);
});

test("does not create a portal shoot when NAS has no stills", () => {
  assert.equal(shouldCreatePortalShoot(0), false);
  assert.equal(shouldCreatePortalShoot(83), true);
});
