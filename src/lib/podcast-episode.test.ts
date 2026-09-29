import assert from "node:assert/strict";
import { test } from "node:test";
import { groupPodcastFiles, isVerticalClip, parseEpisodeIdentity, podcastCoverUrl } from "./podcast-episode";

test("episode titles pick a number and a guest", () => {
  assert.deepEqual(parseEpisodeIdentity("Ep 12 - Maya Chen"), {
    heading: "Episode 12",
    guest: "Maya Chen",
    episode: 12,
  });
  assert.deepEqual(parseEpisodeIdentity("Episode 4 with Jonah Hale"), {
    heading: "Episode 4",
    guest: "Jonah Hale",
    episode: 4,
  });
  assert.deepEqual(parseEpisodeIdentity("#12"), {
    heading: "Episode 12",
    guest: null,
    episode: 12,
  });
  assert.deepEqual(parseEpisodeIdentity("E12"), {
    heading: "Episode 12",
    guest: null,
    episode: 12,
  });
  assert.deepEqual(parseEpisodeIdentity("53 Stanwyck Road", "2026-09-04 - 53 Stanwyck Road"), {
    heading: "53 Stanwyck Road",
    guest: null,
    episode: null,
  });
  assert.deepEqual(parseEpisodeIdentity("Kitchen", "2026-09-04 - Ep 3 - Alex Kim"), {
    heading: "Episode 3",
    guest: "Alex Kim",
    episode: 3,
  });
});

test("podcast files split into full episode, clips, audio, and stills", () => {
  const groups = groupPodcastFiles([
    { id: "still", filename: "cover.jpg", type: "photo", sortOrder: 0, width: 1200, height: 800 },
    { id: "short", filename: "clip-vertical.mp4", type: "video", sortOrder: 2, width: 1080, height: 1920 },
    { id: "wide", filename: "b-roll.mp4", type: "video", sortOrder: 3, width: 1920, height: 1080 },
    { id: "full", filename: "Interview/full-episode.mp4", type: "video", sortOrder: 1, width: 1280, height: 720 },
    { id: "audio", filename: "mix.wav", type: "audio", sortOrder: 4 },
  ]);
  assert.equal(groups.full?.id, "full");
  assert.deepEqual(groups.clips.map((file) => file.id), ["short", "wide"]);
  assert.equal(groups.audio[0]?.id, "audio");
  assert.equal(groups.stills[0]?.id, "still");
  assert.equal(isVerticalClip(groups.clips[0]), true);
  assert.equal(isVerticalClip(groups.clips[1]), false);
});

test("raw clips stay out of the episode and clip groups", () => {
  const groups = groupPodcastFiles([
    { id: "full", filename: "full-episode.mp4", type: "video", sortOrder: 0, width: 1920, height: 1080 },
    { id: "raw", filename: "Raw Video/A001.mp4", type: "raw_video", sortOrder: 1, width: 3840, height: 2160 },
  ]);
  assert.equal(groups.full?.id, "full");
  assert.deepEqual(groups.clips, []);
  assert.deepEqual(groups.stills, []);
  assert.deepEqual(groups.audio, []);
});

test("without a full/episode/master name, the largest video is the episode", () => {
  const groups = groupPodcastFiles([
    { id: "small", filename: "teaser.mp4", type: "video", sortOrder: 0, width: 640, height: 360 },
    { id: "large", filename: "show.mp4", type: "video", sortOrder: 1, width: 1920, height: 1080 },
  ]);
  assert.equal(groups.full?.id, "large");
  assert.deepEqual(groups.clips.map((file) => file.id), ["small"]);
});

test("episode cards prefer the first still, then a video poster", () => {
  assert.equal(
    podcastCoverUrl([
      { id: "v", filename: "show.mp4", type: "video", sortOrder: 0, thumbUrl: "/v.jpg" },
      { id: "p", filename: "cover.jpg", type: "photo", sortOrder: 1, thumbUrl: "/p.jpg" },
    ]),
    "/p.jpg",
  );
  assert.equal(
    podcastCoverUrl([{ id: "v", filename: "show.mp4", type: "video", sortOrder: 0, thumbUrl: "/v.jpg" }]),
    "/v.jpg",
  );
  assert.equal(podcastCoverUrl([]), null);
});
