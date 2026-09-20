import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClientHeader } from "@/components/client-header";
import { BookTimesForm } from "@/components/forms/book-times-form";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { TimesHelpNote } from "@/components/times-help-note";
import { getSession } from "@/lib/auth";
import { ensureDb } from "@/lib/db/ensure";
import { loadLiveAvailabilitySources, offerSlotsForAddress } from "@/lib/scheduling/availability";
import { loadConfirmedPortalJobs } from "@/lib/scheduling/bookings";
import { resolveBookAddress } from "@/lib/scheduling/places";
import { parseSchedulingServices } from "@/lib/scheduling/services";
import { schedulingBookHref } from "@/lib/scheduling/urls";

export const metadata: Metadata = {
  title: "Available times",
};

export default async function SchedulingTimesPage({
  searchParams,
}: {
  searchParams: Promise<{
    address?: string;
    placeId?: string;
    service?: string | string[];
    notes?: string;
    error?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/");
  }
  await ensureDb();
  const {
    address: rawAddress = "",
    placeId: rawPlaceId = "",
    service: rawService,
    notes: rawNotes = "",
    error,
  } = await searchParams;
  const selectedServices = parseSchedulingServices(rawService);
  const typedAddress = rawAddress.trim();
  const placeId = rawPlaceId.trim();
  const notes = rawNotes.trim();

  if (selectedServices.length === 0) {
    redirect(
      schedulingBookHref({
        address: typedAddress || null,
        placeId: placeId || null,
        notes: notes || null,
        error: "Pick at least one service.",
      }),
    );
  }

  const resolved = await resolveBookAddress(typedAddress, placeId || null);
  if (!resolved.ok) {
    redirect(
      schedulingBookHref({
        address: typedAddress || null,
        placeId: placeId || null,
        services: selectedServices,
        notes: notes || null,
        error: resolved.error,
      }),
    );
  }

  const changeHref = schedulingBookHref({
    address: resolved.address,
    services: selectedServices,
    notes: notes || null,
  });
  const portalJobs = await loadConfirmedPortalJobs();
  const sources = await loadLiveAvailabilitySources({
    portalBusy: portalJobs.map((job) => ({ start: job.start, end: job.end })),
    portalJobs,
  });
  if ("error" in sources) {
    return (
      <TimesShell changeHref={changeHref} error={sources.error}>
        <TimesUnavailable address={resolved.address} services={selectedServices} changeHref={changeHref} />
      </TimesShell>
    );
  }

  const availability = await offerSlotsForAddress(resolved.address, sources, selectedServices);
  if (availability.error) {
    redirect(
      schedulingBookHref({
        address: typedAddress || null,
        services: selectedServices,
        notes: notes || null,
        error: availability.error,
      }),
    );
  }

  return (
    <TimesShell changeHref={changeHref} error={error}>
      <BookTimesForm
        availability={availability}
        services={selectedServices}
        notes={notes}
        error={error}
      />
    </TimesShell>
  );
}

function TimesShell({
  changeHref,
  error,
  children,
}: {
  changeHref: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <PhoneShell>
      <ClientHeader backHref={changeHref} backLabel="Address" />
      <div className="mb-8 lg:mb-10">
        <h1 className="text-[28px] font-bold leading-tight lg:text-[32px]">Scheduling</h1>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-[#a1a1a1]">
            {error}
          </p>
        ) : null}
      </div>
      <FormColumn className="pb-16">{children}</FormColumn>
    </PhoneShell>
  );
}

function TimesUnavailable({
  address,
  services,
  changeHref,
}: {
  address: string;
  services: string[];
  changeHref: string;
}) {
  return (
    <div>
      <p className="text-sm text-[#8e8e93]">Step 2 of 2 — available times</p>
      <ul className="mt-3 flex flex-col gap-0.5">
        {services.map((service) => (
          <li key={service} className="text-[15px]">
            {service}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm text-[#8e8e93]">{address}</p>
      <Link href={changeHref} className="mt-2 inline-block text-sm text-[#8e8e93] underline">
        Change services or address
      </Link>
      <TimesHelpNote />
      <p className="mt-8 text-sm text-[#8e8e93]">Times cannot be loaded until calendar lookup is back.</p>
    </div>
  );
}
