import { Field, SubmitButton } from "@/components/field";
import { createBooking } from "@/lib/actions/scheduling";
import { CLIENT_SCHEDULING } from "@/lib/routes";
import type { AvailabilityResult, OfferedSlot } from "@/lib/scheduling/availability";

export function BookShootForm({
  address,
  addressError,
  availability,
}: {
  address: string;
  addressError?: string;
  availability: AvailabilityResult | null;
}) {
  return (
    <div>
      <form action={CLIENT_SCHEDULING} method="get" className="flex flex-col gap-4">
        <Field
          id="address"
          name="address"
          label="Shoot address"
          defaultValue={address}
          autoComplete="street-address"
          required
          placeholder="123 Main St, City, ST"
        />
        {addressError ? <p className="text-sm text-[#a1a1a1]">{addressError}</p> : null}
        <SubmitButton>{address ? "Update address" : "See available times"}</SubmitButton>
      </form>

      {availability && !availability.error ? (
        <TimesStep availability={availability} />
      ) : null}
    </div>
  );
}

function TimesStep({ availability }: { availability: AvailabilityResult }) {
  const groups = groupSlots(availability.slots);

  return (
    <div className="mt-10">
      <h2 className="mb-2 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">Available times</h2>
      <p className="mb-4 text-sm leading-6 text-[#8e8e93]">
        Times for {availability.address}. Travel uses live drive time plus a 15-minute pad when
        Maps is connected — geography is never guessed.
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
