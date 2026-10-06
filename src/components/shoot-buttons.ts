/** Shared shoot actions. Primary is the solid button; secondary is the outline. */
export const shootChipClass =
  "inline-flex h-9 shrink-0 appearance-none items-center justify-center rounded-lg px-2.5 text-sm";

export const shootPrimaryButtonClass = `${shootChipClass} gap-1 bg-white font-medium text-black disabled:bg-[#c7c7cc] disabled:text-black/45`;

export const shootSecondaryButtonClass = `${shootChipClass} border border-white/20 text-white disabled:text-white/35`;
