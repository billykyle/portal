"use client";

import { useEffect, useRef, useState } from "react";
import { SCHEDULING_INDUSTRIES, schedulingServiceId } from "@/lib/scheduling/services";

export function ServiceFieldset({
  selected,
  name = "service",
}: {
  selected: string[];
  name?: string;
}) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const [picked, setPicked] = useState(selected);
  const [error, setError] = useState("");

  useEffect(() => {
    const maybeForm = fieldsetRef.current?.form;
    if (!maybeForm) return;
    const owner: HTMLFormElement = maybeForm;
    function onSubmit(event: Event) {
      const checked = owner.querySelectorAll(`input[name="${name}"]:checked`);
      if (checked.length === 0) {
        event.preventDefault();
        setError("Pick at least one service.");
      }
    }
    owner.addEventListener("submit", onSubmit);
    return () => owner.removeEventListener("submit", onSubmit);
  }, [name]);

  return (
    <fieldset ref={fieldsetRef} className="flex flex-col gap-5">
      <legend className="text-[16px] font-normal text-white">Services</legend>
      <p className="text-sm leading-6 text-[#8e8e93]">
        Select all that apply, across industries. At least one is required.
      </p>
      {SCHEDULING_INDUSTRIES.map((group) => (
        <fieldset key={group.industry} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm uppercase tracking-[0.14em] text-[#8e8e93]">
            {group.industry}
          </legend>
          <ul className="flex flex-col gap-2">
            {group.options.map((option) => {
              const item = schedulingServiceId(group.industry, option);
              const checked = picked.includes(item);
              return (
                <li key={item}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-4 py-3 has-[:checked]:border-white has-[:checked]:bg-white/5">
                    <input
                      type="checkbox"
                      name={name}
                      value={item}
                      checked={checked}
                      onChange={() => {
                        setPicked((current) =>
                          current.includes(item)
                            ? current.filter((value) => value !== item)
                            : [...current, item],
                        );
                        setError("");
                      }}
                      className="size-4 shrink-0 accent-white"
                    />
                    <span className="text-[15px]">{option}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
    </fieldset>
  );
}
