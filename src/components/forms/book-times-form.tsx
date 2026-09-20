import Link from "next/link";
import { Field, SubmitButton } from "@/components/field";
import { createBooking } from "@/lib/actions/scheduling";
import { schedulingBookHref } from "@/lib/scheduling/urls";
import type { AvailabilityResult, OfferedSlot } from "@/lib/scheduling/availability";

export function BookTimesForm({
  availability,
  services,
}: {
  availability: AvailabilityResult;
  services: string[];
}) {
  const groups = groupSlots(availability.slots);
  const changeHref = schedulingBookHref({
    address: availability.address,
    services,
  });

  return (
    <div>
      <p className="text-sm text-[#8e8e93]">Step 2 of 2 — available times</p>
      <div className="mt-3">
        {services.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {services.map((service) => (
              <li key={service} className="text-[15px]">
                {service}
              </li>
            ))}
          </ul>
        ) : null}
        <p className={services.length > 0 ? "mt-1 text-sm text-[#8e8e93]" : "text-[15px]"}>
          {availability.address}
        </p>
        <Link href={changeHref} className="mt-2 inline-block text-sm text-[#8e8e93] underline">
          Change services or address
        </Link>
      </div>

      <h2 className="mt-8 mb-2 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Available times</h2>
      <p className="mb-4 text-sm leading-6 text-[#8e8e93]">
        Times for this address. Travel uses live drive time plus a 15-minute pad when Maps is
        connected — geography is never guessed.
      </p>
      {availability.notices.map((notice) => (
        <p key={notice} className="mb-4 text-sm leading-6 text-[#c7c7cc]">
          {notice}
        </p>
      ))}
      {availability.slots.length === 0 ? (
        <p className="text-sm text-[#8e8e93]">No times fit this address right now.</p>
      ) : (
        <form action={createBooking} className="flex flex-col gap-6">
          <input type="hidden" name="address" value={availability.address} />
          {services.map((service) => (
            <input key={service} type="hidden" name="service" value={service} />
          ))}
          <fieldset className="flex flex-col gap-6">
            <legend className="sr-only">Choose a time</legend>
            {groups.map((group) => (
              <div key={group.dateLabel}>
                <p className="mb-2 text-[15px] font-medium">{group.dateLabel}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {group.slots.map((slot) => (
                    <li key={slot.start}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 has-[:checked]:border-white has-[:checked]:bg-white/5">
                        <input
                          type="radio"
                          name="slot"
                          value={`${slot.start}|${slot.end}`}
                          required
                          className="size-4 accent-white"
                        />
                        <span className="text-[15px]">{slot.timeLabel}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </fieldset>
          <Field id="notes" name="notes" label="Notes (optional)" placeholder="Lockbox, contact, …" />
          <Field id="accessCodes" name="accessCodes" label="Access codes (optional)" />
          <SubmitButton>Book shoot</SubmitButton>
        </form>
      )}
    </div>
  );
}

function groupSlots(slots: OfferedSlot[]) {
  const groups: Array<{ dateLabel: string; slots: OfferedSlot[] }> = [];
  for (const slot of slots) {
    const last = groups[groups.length - 1];
    if (!last || last.dateLabel !== slot.dateLabel) {
      groups.push({ dateLabel: slot.dateLabel, slots: [slot] });
    } else {
      last.slots.push(slot);
    }
  }
  return groups;
}
