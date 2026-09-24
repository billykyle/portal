import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectNasDeliverables,
  guessMediaType,
  isFloorPlanFolderName,
  isVideoFolderName,
  mediaImportFilename,
  selectFloorPlanFolders,
  selectStillsFolder,
  type ListedNasEntry,
} from "./nas-media";

test("guesses type from extension, folder, then filename", () => {
  assert.equal(guessMediaType("walk.mp4"), "video");
  assert.equal(guessMediaType("188 33rd Street.mov"), "video");
  assert.equal(guessMediaType("Full-01.jpg"), "photo");
  assert.equal(guessMediaType("1st_floor_188_33rd.jpg"), "floor_plan");
  assert.equal(guessMediaType("Full-01.jpg", "Floor Plan"), "floor_plan");
  assert.equal(guessMediaType("layout.svg"), "floor_plan");
  assert.equal(guessMediaType("plan.pdf"), "floor_plan");
});

test("recognizes floor-plan and video folder names", () => {
  assert.equal(isFloorPlanFolderName("Floor Plan"), true);
  assert.equal(isFloorPlanFolderName("3D Floorplan"), true);
  assert.equal(isFloorPlanFolderName("Plans"), true);
  assert.equal(isFloorPlanFolderName("Photos"), false);
  assert.equal(isFloorPlanFolderName("jpg-with-dim"), false);
  assert.equal(isVideoFolderName("Video"), true);
  assert.equal(isVideoFolderName("Videos"), true);
  assert.equal(isVideoFolderName("January Videos"), true);
  assert.equal(isVideoFolderName("Photos"), false);
});

test("picks the first preferred stills folder", () => {
  const dirs = [{ name: "Floor Plan" }, { name: "Photos" }, { name: "Final" }];
  assert.equal(selectStillsFolder(dirs, ["Final", "Photos"])?.name, "Photos");
  assert.equal(selectStillsFolder([{ name: "Floor Plan" }], ["Final", "Photos"]), null);
  assert.deepEqual(
    selectFloorPlanFolders([{ name: "Floor Plan" }, { name: "3D Floorplan" }, { name: "Photos" }]).map(
      (dir) => dir.name,
    ),
    ["Floor Plan", "3D Floorplan"],
  );
});

test("keeps stills as the basename and nested plans as a shoot-relative path", () => {
  const shoot = "/share/Paul/2026.07.10 - 188 33rd Street";
  const stills = `${shoot}/Final`;
  assert.equal(mediaImportFilename(`${stills}/Full-001.jpg`, "Full-001.jpg", shoot, stills), "Full-001.jpg");
  assert.equal(
    mediaImportFilename(
      `${shoot}/Floor Plan/jpg-with-dim/1st_floor.jpg`,
      "1st_floor.jpg",
      shoot,
      stills,
    ),
    "Floor Plan/jpg-with-dim/1st_floor.jpg",
  );
  assert.equal(mediaImportFilename(`${shoot}/188 33rd Street.mov`, "188 33rd Street.mov", shoot, stills), "188 33rd Street.mov");
});

test("collects photos, nested floor plans, and root videos from a real shoot layout", async () => {
  const shoot = "/share/Paul/2026.07.10 - 188 33rd Street";
  const tree: Record<string, ListedNasEntry[]> = {
    [shoot]: [
      { name: "Final", path: `${shoot}/Final`, isDir: true },
      { name: "Floor Plan", path: `${shoot}/Floor Plan`, isDir: true },
      { name: "188 33rd Street.mov", path: `${shoot}/188 33rd Street.mov`, isDir: false },
      { name: "188 33rd Street - MLS.mov", path: `${shoot}/188 33rd Street - MLS.mov`, isDir: false },
    ],
    [`${shoot}/Final`]: [
      { name: "Full-001.jpg", path: `${shoot}/Final/Full-001.jpg`, isDir: false },
      { name: "notes.txt", path: `${shoot}/Final/notes.txt`, isDir: false },
    ],
    [`${shoot}/Floor Plan`]: [
      { name: "jpg-with-dim", path: `${shoot}/Floor Plan/jpg-with-dim`, isDir: true },
      { name: "jpg-without-dim", path: `${shoot}/Floor Plan/jpg-without-dim`, isDir: true },
    ],
    [`${shoot}/Floor Plan/jpg-with-dim`]: [
      {
        name: "1st_floor_188_33rd_street_avalon_with_dim.jpg",
        path: `${shoot}/Floor Plan/jpg-with-dim/1st_floor_188_33rd_street_avalon_with_dim.jpg`,
        isDir: false,
      },
    ],
    [`${shoot}/Floor Plan/jpg-without-dim`]: [
      {
        name: "1st_floor_188_33rd_street_avalon_without_dim.jpg",
        path: `${shoot}/Floor Plan/jpg-without-dim/1st_floor_188_33rd_street_avalon_without_dim.jpg`,
        isDir: false,
      },
    ],
  };

  const files = await collectNasDeliverables({
    shootFolderPath: shoot,
    stillsFolders: ["Final", "Photos"],
    list: (dir) => tree[dir] ?? [],
  });

  assert.deepEqual(
    files.map((file) => [file.type, file.name]),
    [
      ["photo", "Full-001.jpg"],
      ["floor_plan", "Floor Plan/jpg-with-dim/1st_floor_188_33rd_street_avalon_with_dim.jpg"],
      ["floor_plan", "Floor Plan/jpg-without-dim/1st_floor_188_33rd_street_avalon_without_dim.jpg"],
      ["video", "188 33rd Street.mov"],
      ["video", "188 33rd Street - MLS.mov"],
    ],
  );
});

test("ignores lighter renditions stored beside the original", async () => {
  const shoot = "/share/Sam/2026.09.04 - 1843 Beacon Hill Drive";
  const files = await collectNasDeliverables({
    shootFolderPath: shoot,
    stillsFolders: ["Final", "Photos"],
    list: (dir) => {
      if (dir === shoot) {
        return [
          { name: "Final", path: `${shoot}/Final`, isDir: true },
          { name: ".portal-renditions", path: `${shoot}/.portal-renditions`, isDir: true },
          { name: "captions.mov", path: `${shoot}/captions.mov`, isDir: false },
        ];
      }
      if (dir === `${shoot}/Final`) {
        return [{ name: "Full-01.jpg", path: `${shoot}/Final/Full-01.jpg`, isDir: false }];
      }
      if (dir === `${shoot}/.portal-renditions`) {
        return [{ name: "abc-720.mp4", path: `${shoot}/.portal-renditions/abc-720.mp4`, isDir: false }];
      }
      return [];
    },
  });
  assert.deepEqual(
    files.map((file) => file.name),
    ["Full-01.jpg", "captions.mov"],
  );
});

test("imports a video-only monthly folder and a 3D floorplan sibling", async () => {
  const videos = "/share/Sam/2026.08.19 - August Videos";
  const videoFiles = await collectNasDeliverables({
    shootFolderPath: videos,
    stillsFolders: ["Final", "Photos"],
    list: (dir) =>
      dir === videos
        ? [
            { name: "001 - Juice Pod.mov", path: `${videos}/001 - Juice Pod.mov`, isDir: false },
            { name: "001 - Juice Pod - captions.mp4", path: `${videos}/001 - Juice Pod - captions.mp4`, isDir: false },
          ]
        : [],
  });
  assert.equal(videoFiles.length, 2);
  assert.ok(videoFiles.every((file) => file.type === "video"));

  const cove = "/share/Sam/2026.07.01 - 49 Cove Road";
  const coveFiles = await collectNasDeliverables({
    shootFolderPath: cove,
    stillsFolders: ["Final", "Photos"],
    list: (dir) => {
      if (dir === cove) {
        return [
          { name: "Photos", path: `${cove}/Photos`, isDir: true },
          { name: "Floor Plan", path: `${cove}/Floor Plan`, isDir: true },
          { name: "3D Floorplan", path: `${cove}/3D Floorplan`, isDir: true },
        ];
      }
      if (dir === `${cove}/Photos`) {
        return [{ name: "Full-1.jpg", path: `${cove}/Photos/Full-1.jpg`, isDir: false }];
      }
      if (dir === `${cove}/Floor Plan`) {
        return [
          {
            name: "1st_floor.jpg",
            path: `${cove}/Floor Plan/1st_floor.jpg`,
            isDir: false,
          },
        ];
      }
      if (dir === `${cove}/3D Floorplan`) {
        return [{ name: "2nd_floor.png", path: `${cove}/3D Floorplan/2nd_floor.png`, isDir: false }];
      }
      return [];
    },
  });
  assert.deepEqual(
    coveFiles.map((file) => [file.type, file.name]),
    [
      ["photo", "Full-1.jpg"],
      ["floor_plan", "Floor Plan/1st_floor.jpg"],
      ["floor_plan", "3D Floorplan/2nd_floor.png"],
    ],
  );
});
