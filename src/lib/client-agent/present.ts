import { shootShare, summarizeMedia, type MediaInventoryItem } from "@/lib/agent/present";
import { formatShootDate } from "@/lib/media";
import { bookingServiceList } from "@/lib/scheduling/services";
import type { Booking } from "@/lib/db/schema";

export function clientShootSummary(
  shoot: { id: string; shotDate: string; address: string; publicToken: string },
  items: MediaInventoryItem[],
) {
  const media = summarizeMedia(items);
  const share = shootShare(shoot.publicToken);
  return {
    id: shoot.id,
    shotDate: shoot.shotDate,
    dateLabel: formatShootDate(shoot.shotDate),
    address: shoot.address,
    counts: media.counts,
    ready: media.ready,
    shareUrl: share.publicUrl,
  };
}

export function clientShootDetail(
  shoot: { id: string; shotDate: string; address: string; publicToken: string },
  items: MediaInventoryItem[],
) {
  const media = summarizeMedia(items);
  return {
    ...clientShootSummary(shoot, items),
    photos: media.photos,
    floorPlans: media.floorPlans,
    videos: media.videos,
    rawVideos: media.rawVideos,
  };
}

export function clientBookingSummary(booking: Booking) {
  return {
    id: booking.id,
    address: booking.address,
    services: bookingServiceList(booking),
    commercialVideoHours: booking.commercialVideoHours,
    startsAt: booking.startsAt?.toISOString() ?? null,
    endsAt: booking.endsAt?.toISOString() ?? null,
    status: booking.status,
    notes: booking.notes,
  };
}
