import { loadLiveAvailabilitySources, offerSlotsForAddress, withoutOwnBooking, type AvailabilityResult } from "./availability";
import {
  canAdminOpenBooking,
  canClientOpenBooking,
  getBookingById,
  getClientBooking,
  loadConfirmedPortalJobs,
} from "./bookings";
import { resolveBookAddress } from "./places";
import { parseSchedulingServices } from "./services";

export type OfferedAvailabilityFailureKind = "address" | "calendar" | "availability";

export type OfferedAvailabilitySuccess = {
  ok: true;
  availability: AvailabilityResult;
};

export type OfferedAvailabilityFailure = {
  ok: false;
  kind: OfferedAvailabilityFailureKind;
  error: string;
};

export type OfferedAvailabilityResult = OfferedAvailabilitySuccess | OfferedAvailabilityFailure;

export type ModifyAvailabilityContext = {
  id: string;
  startsAt: Date | null;
  endsAt: Date | null;
  calendarEventId: string | null;
};

export async function loadModifyAvailabilityContext(
  clientId: string,
  modifyId: string | null | undefined,
): Promise<ModifyAvailabilityContext | { error: string } | null> {
  const id = String(modifyId ?? "").trim();
  if (!id) return null;
  const booking = await getClientBooking(clientId, id);
  if (!booking || !canClientOpenBooking(booking, clientId)) {
    return { error: "That booking cannot be modified." };
  }
  return {
    id: booking.id,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    calendarEventId: booking.calendarEventId,
  };
}

export async function loadAdminModifyAvailabilityContext(
  modifyId: string | null | undefined,
): Promise<ModifyAvailabilityContext | { error: string } | null> {
  const id = String(modifyId ?? "").trim();
  if (!id) return null;
  const booking = await getBookingById(id);
  if (!booking || !canAdminOpenBooking(booking)) {
    return { error: "That booking cannot be modified." };
  }
  return {
    id: booking.id,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    calendarEventId: booking.calendarEventId,
  };
}

export async function loadOfferedAvailability(input: {
  address: string;
  placeId?: string | null;
  services: readonly string[];
  commercialHours?: number | null;
  modifying?: ModifyAvailabilityContext | null;
}): Promise<OfferedAvailabilityResult> {
  const services = parseSchedulingServices(input.services);
  const resolved = await resolveBookAddress(input.address, input.placeId || null);
  if (!resolved.ok) {
    return { ok: false, kind: "address", error: resolved.error };
  }

  const portalJobs = await loadConfirmedPortalJobs({ excludeBookingId: input.modifying?.id });
  const loaded = await loadLiveAvailabilitySources({
    portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
    portalJobs,
  });
  if ("error" in loaded) {
    return { ok: false, kind: "calendar", error: loaded.error };
  }

  const ownWindow =
    input.modifying?.startsAt && input.modifying.endsAt
      ? { start: input.modifying.startsAt, end: input.modifying.endsAt }
      : null;
  const sources = ownWindow
    ? withoutOwnBooking(loaded, ownWindow, { calendarEventId: input.modifying?.calendarEventId })
    : loaded;

  const availability = await offerSlotsForAddress(resolved.address, sources, services, {
    retainStarts: ownWindow ? [ownWindow.start] : undefined,
    commercialHours: input.commercialHours,
  });
  if (availability.error) {
    return { ok: false, kind: "availability", error: availability.error };
  }
  return { ok: true, availability };
}
