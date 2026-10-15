# Mux video

Finished shoot video plays through Mux. The NAS stays the source of truth and keeps the full-quality original. Raw video is not sent to Mux.

## Cost

Assets are created at `video_quality: basic` with `max_resolution_tier: 1080p` and one standard static rendition, `highest`. Basic input is free. The standard MP4 is free to generate. Storage and delivery are billed at the resolution tier. Explicit 720p or 1080p static renditions are advanced and add a per-minute preparation charge, so they are not used. Master access, captions, plus, and premium are off.

The client download is that web MP4, up to 1080p, and Mux does not upscale. It is not the NAS original. Originals stay on the share. A 4K download means setting `max_resolution_tier` to `2160p`. That stays on basic (still free to encode) and raises storage and delivery to the 4K rates. It is still not the camera original.

## Ingest

NAS sync does not send video to Mux. A sync that waits on Mux, or that runs while Mux is copying many originals off the share, loses its heartbeat and the lock is cleared. New and changed files are left for `backfill_mux_videos`. That backfill will not start while a sync is running, and it creates at most one asset per run while any video is still preparing.

Mux is given `https://portal.billy-kyle.com/api/mux/source/{mediaId}?exp&sig`. That route checks a 12-hour HMAC, then 302s Mux at a fresh NAS download URL. It does not stream the file, and it does not probe the NAS on every request. While a sync is running, or while another original is already being copied, the route returns 503 with `Retry-After` and does not touch the share. The same file may keep its lease and finish. Ingest still checks once, before creating an asset, that the share URL returns media without the share cookie.

Unchanged files (same path, and the same byte size when both sizes are known, and not errored) are skipped when the asset and the static rendition are ready. A preparing asset, or a ready asset whose MP4 is not ready, is refreshed with a GET. `force` creates a new asset, still only one per run when another pull is open.

`mux_asset_id`, `mux_playback_id`, `mux_status`, `mux_static_status`, and the source path and size are stored on `media`. `POST /api/mux/webhook` updates status from Mux. Playback is signed (RS256, 12 hours) so a public share page does not leak a permanent playback id.

If the NAS URL is not reachable without the share cookie, ingest does not create assets.

## Playback and downloads

The shoot page, the admin shoot page, and video tiles mount Mux Player when a playback token exists. The poster is a signed Mux thumbnail and the display size comes from the Mux video track, then from the player once it has loaded. The page does not request the NAS original or `GET /api/media/{id}/dimensions` for a video Mux already knows about, including one that is still preparing or marked errored. `Processing` is shown until playback is ready, and the page polls `GET /api/media/{id}/mux`.

A finished video Mux has never seen, and every raw clip, shows its thumbnail. The file URL is attached only after Play. **Download** is the control that reads the NAS original, and that link uses `?download=1`. A Mux-tracked file returns 404 for any other read, so a player cannot fall back to the NAS on page load.

Per-clip **Download** uses `https://stream.mux.com/{playbackId}/highest.mp4` with a signed token when that MP4 is ready. While it is still preparing, the control says **Preparing download**. If Mux has no MP4, Download saves the NAS original.

Shoot zips contain photos and floor plans only. Finished video and raw video are left out, and the zip includes `VIDEOS.txt` when any video was omitted. A video-only shoot does not start a zip. Select download zips two or more stills and saves each video on its own.

## Admin

`get_shoot` includes `mux` on each finished video: `status`, `assetId`, `playbackId`, `staticStatus`, `error`.

`backfill_mux_videos` lists Mux assets (a harmless credential check) and creates a signing key and webhook when the token has System write. That setup is in the response. If the token cannot create them, status is `blocked` and the message says what to add in the Mux dashboard. If a NAS sync is running, status is `deferred` and ingest does not start. Otherwise ingest continues after the response, one new NAS download at a time. Call again with `reportOnly: true` until `job.status` is `done`. `job.report` then has how many videos were sent, how many were deferred, and each video's status. Optional `shootId`. `force` replaces an existing asset, still one new download at a time.

## What Billy sets in Mux

`MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` are already on Vercel for Production and Preview. The app stores a signing key and webhook secret in Postgres when the token can create them.

If that call is forbidden, create both in the Mux dashboard and set them on Production and Preview, then redeploy:

1. Settings → Signing Keys → Generate new key. `MUX_SIGNING_KEY_ID` is the key id. `MUX_SIGNING_KEY` is the base64 private key, shown once.
2. Settings → Webhooks → `https://portal.billy-kyle.com/api/mux/webhook`. `MUX_WEBHOOK_SECRET` is the signing secret.

If a webhook already points at that address and Mux will not show the secret again, set `MUX_WEBHOOK_SECRET` from the dashboard or delete the webhook so the app can create a new one.
