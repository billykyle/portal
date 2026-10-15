import { muxAssetError, signedPlaybackId, staticRenditionStatus, type MuxAsset } from "./mux-api";
import { applyMuxAssetUpdate } from "./mux-store";

type MuxEvent = {
  type?: string;
  data?: MuxAsset & { asset_id?: string; resolution?: string; name?: string; status?: string };
};

export async function applyMuxEvent(event: MuxEvent) {
  const type = event.type ?? "";
  const data = event.data;
  if (!data) return 0;
  if (type === "video.asset.ready" || type === "video.asset.errored" || type === "video.asset.created") {
    const status = data.status === "ready" || data.status === "errored" ? data.status : "preparing";
    return applyMuxAssetUpdate({
      passthrough: data.passthrough,
      assetId: data.id,
      status,
      playbackId: signedPlaybackId(data),
      staticStatus: staticRenditionStatus(data),
      error: status === "errored" ? muxAssetError(data) : null,
    });
  }
  if (type.startsWith("video.asset.static_rendition.")) {
    const status = data.status === "ready" || data.status === "errored" || data.status === "skipped" || data.status === "preparing"
      ? data.status
      : type.endsWith(".ready")
        ? "ready"
        : type.endsWith(".errored")
          ? "errored"
          : type.endsWith(".skipped")
            ? "skipped"
            : "preparing";
    return applyMuxAssetUpdate({
      passthrough: data.passthrough,
      assetId: data.asset_id ?? null,
      staticStatus: status,
      error: status === "errored" ? muxAssetError(data) : undefined,
    });
  }
  return 0;
}
