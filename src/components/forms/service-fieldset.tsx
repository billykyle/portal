"use client";

import { useEffect, useRef, useState } from "react";
import { SCHEDULING_SERVICES } from "@/lib/scheduling/services";

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
    <fieldset ref={fieldsetRef} className="flex flex-col gap-3">
      <legend className="text-[16px] font-normal text-white">Services</legend>
      <p className="text-sm leading-6 text-[#8e8e93]">Select all that apply. At least one is required.</p>
      <ul className="flex flex-col gap-2">
        {SCHEDULING_SERVICES.map((item) => {
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
                <span className="text-[15px]">{item}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-sm text-[#a1a1a1]">{error}</p> : null}
    </fieldset>
  );
}
