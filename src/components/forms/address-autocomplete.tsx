"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { PLACES_MISSING_KEY_MESSAGE, type AddressSuggestion } from "@/lib/scheduling/places-shared";

type SuggestResponse = {
  configured?: boolean;
  suggestions?: AddressSuggestion[];
  error?: string;
};

type DetailsResponse = {
  address?: string | null;
  error?: string;
};

export function AddressAutocomplete({
  defaultValue = "",
  defaultPlaceId = "",
  placesConfigured,
  error,
}: {
  defaultValue?: string;
  defaultPlaceId?: string;
  placesConfigured: boolean;
  error?: string;
}) {
  const inputId = "address";
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(newSessionToken());
  const [value, setValue] = useState(defaultValue);
  const [placeId, setPlaceId] = useState(defaultPlaceId);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupError, setLookupError] = useState(placesConfigured ? "" : PLACES_MISSING_KEY_MESSAGE);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!placesConfigured) return;
    const query = value.replace(/\s+/g, " ").trim();
    if (query.length < 3 || placeId) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: query,
          sessionToken: sessionRef.current,
        });
        const res = await fetch(`/api/scheduling/address-suggest?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = (await res.json()) as SuggestResponse;
        if (!res.ok && res.status === 401) {
          setLookupError("Sign in to look up an address.");
          setSuggestions([]);
          return;
        }
        if (body.configured === false) {
          setLookupError(body.error || PLACES_MISSING_KEY_MESSAGE);
          setSuggestions([]);
          return;
        }
        setLookupError(body.error ?? "");
        setSuggestions(body.suggestions ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch (caught) {
        if ((caught as { name?: string }).name === "AbortError") return;
        setSuggestions([]);
        setLookupError("Address lookup is unavailable right now. Geography is never guessed.");
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [placeId, placesConfigured, value]);

  async function choose(suggestion: AddressSuggestion) {
    setValue(suggestion.label);
    setPlaceId(suggestion.placeId);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    setLookupError("");
    try {
      const params = new URLSearchParams({
        placeId: suggestion.placeId,
        sessionToken: sessionRef.current,
      });
      const res = await fetch(`/api/scheduling/address?${params}`, { cache: "no-store" });
      const body = (await res.json()) as DetailsResponse;
      if (body.address) setValue(body.address);
    } catch {
      // Suggestion label is already a full formatted prediction.
    }
    sessionRef.current = newSessionToken();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) void choose(suggestion);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showList = open && suggestions.length > 0;
  const message = error || lookupError;

  return (
    <div ref={rootRef} className="relative flex flex-col gap-2">
      <label htmlFor={inputId} className="text-[16px] font-normal text-white">
        Shoot address
      </label>
      <input
        id={inputId}
        name="address"
        value={value}
        required
        autoComplete={placesConfigured ? "off" : "street-address"}
        autoCorrect="off"
        spellCheck={false}
        inputMode="text"
        placeholder="Start typing a street address"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setPlaceId("");
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
      />
      <input type="hidden" name="placeId" value={placeId} />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%-0.25rem)] z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#1c1c1e] py-1 shadow-lg"
        >
          {suggestions.map((suggestion, index) => {
            const active = index === activeIndex;
            return (
              <li key={suggestion.placeId} role="presentation">
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex min-h-12 w-full flex-col items-start justify-center px-4 py-3 text-left ${
                    active ? "bg-white/10" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void choose(suggestion)}
                >
                  <span className="text-[15px] text-white">{suggestion.primaryText}</span>
                  {suggestion.secondaryText ? (
                    <span className="text-sm text-[#8e8e93]">{suggestion.secondaryText}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {loading && !showList ? <p className="text-sm text-[#8e8e93]">Looking up addresses…</p> : null}
      {message ? <p className="text-sm text-[#a1a1a1]">{message}</p> : null}
    </div>
  );
}

function newSessionToken() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `places-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
