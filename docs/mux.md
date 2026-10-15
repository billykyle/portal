# Mux video

Finished shoot video plays through Mux. The NAS stays the source of truth and keeps the full-quality original. Raw video is not sent to Mux.

## Cost

Assets are created at `video_quality: basic` (720p cap) with one standard static rendition, `highest`. Standard renditions bill storage and delivery. They do not add encode minutes. Explicit 720p or 1080p static renditions are advanced and are not used. Master access, captions, plus, and premium are off.

The client download is that web MP4 (up to 720p), not the NAS original. Originals stay on the share for Billy.

## Ingest

NAS sync submits each new or changed finished video once. Mux is given `https://portal.billy-kyle.com/api/mux/source/{mediaId}?exp&sig`. That route checks a 12-hour HMAC, confirms the NAS share URL returns media without the share cookie, then 302s Mux at a fresh NAS download URL. The function does not stream the file.

Unchanged files (same path, and the same byte size when both sizes are known, and not errored) are skipped when the asset and the static rendition are ready. A preparing asset, or a ready asset whose MP4 is not ready, is refreshed with a GET. `force` always creates a new asset.

`mux_asset_id`, `mux_playback_id`, `mux_status`, `mux_static_status`, and the source path and size are stored on `media`. `POST /api/mux/webhook` updates status from Mux. Playback is signed (RS256, 12 hours) so a public share page does not leak a permanent playback id.

If the NAS URL is not reachable without the share cookie, ingest does not create assets.

## Playback and downloads

The shoot page and video tiles mount Mux Player when the asset is ready and a playback token exists. `Processing` is shown until then, and the page polls `GET /api/media/{id}/mux`. If Mux errors, or there is no Mux row yet, the page falls back to the existing player (a lighter NAS rendition when one exists, otherwise the original).

Per-clip **Download** uses `https://stream.mux.com/{playbackId}/highest.mp4` with a signed token. While the MP4 is still preparing, the control says **Preparing download**.

Shoot zips contain photos and floor plans only. Finished video and raw video are left out, and the zip includes `VIDEOS.txt` when any video was omitted. A video-only shoot does not start a zip. Select download zips two or more stills and saves each video on its own.

## Admin

`get_shoot` includes `mux` on each finished video: `status`, `assetId`, `playbackId`, `staticStatus`, `error`.

`backfill_mux_videos` lists Mux assets (a harmless credential check), creates a signing key and webhook when the token has System write, then submits videos. Optional `shootId`. `force` replaces an existing asset.

## What Billy sets in Mux

`MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` are already on Vercel for Production and Preview. The app stores a signing key and webhook secret in Postgres when the token can create them.

If that call is forbidden, create both in the Mux dashboard and set them on Production and Preview, then redeploy:

1. Settings → Signing Keys → Generate new key. `MUX_SIGNING_KEY_ID` is the key id. `MUX_SIGNING_KEY` is the base64 private key, shown once.
2. Settings → Webhooks → `https://portal.billy-kyle.com/api/mux/webhook`. `MUX_WEBHOOK_SECRET` is the signing secret.

If a webhook already points at that address and Mux will not show the secret again, set `MUX_WEBHOOK_SECRET` from the dashboard or delete the webhook so the app can create a new one.
