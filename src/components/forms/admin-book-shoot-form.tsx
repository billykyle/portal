"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AddressAutocomplete } from "@/components/forms/address-autocomplete";
import { ServiceFieldset } from "@/components/forms/service-fieldset";
import { Field, FormError, SubmitButton } from "@/components/field";
import { bookShootForClient, type AdminBookState } from "@/lib/actions/admin-booking";
import {
  adminShootWindow,
  formatAdminShootPreview,
  parseAdminShootDate,
  parseAdminShootTime,
  shootOverlapWarning,
} from "@/lib/scheduling/admin-time";
import { DEFAULT_TIMEZONE } from "@/lib/scheduling/rules";
import { zonedDateTimeToUtc } from "@/lib/scheduling/zoned-time";
import { useActionState } from "react";

export type AdminBookClientOption = {
  id: string;
  displayName: string;
  company: string | null;
  inviteCode: string;
};

export type AdminBookInterval = { start: string; end: string };

export function AdminBookShootForm({
  clients,
  jobs,
  placesConfigured,
}: {
  clients: AdminBookClientOption[];
  jobs: AdminBookInterval[];
  placesConfigured: boolean;
}) {
  const [state, action, pending] = useActionState(bookShootForClient, undefined);
  const [formKey, setFormKey] = useState(0);
  const resetFor = useRef<AdminBookState | undefined>(undefined);

  useEffect(() => {
    if (!state?.ok || resetFor.current === state) return;
    resetFor.current = state;
    setFormKey((key) => key + 1);
  }, [state]);

  return (
    <div className="max-w-md">
      {state?.ok ? (
        <div className="mb-4 flex flex-col gap-2">
          <p role="status" className="text-sm text-white">
            {state.message}
          </p>
          {state.overlap ? <p className="text-sm text-[#a1a1a1]">{state.overlap}</p> : null}
          {state.calendar === "failed" ? (
            <p className="text-sm text-[#a1a1a1]">Calendar was not updated.</p>
          ) : null}
          {state.email === "failed" ? (
            <p className="text-sm text-[#a1a1a1]">Confirmation email was not sent.</p>
          ) : null}
        </div>
      ) : (
        <FormError message={state?.error} />
      )}
      <AdminBookShootFields
        key={formKey}
        action={action}
        pending={pending}
        clients={clients}
        jobs={jobs}
        placesConfigured={placesConfigured}
      />
    </div>
  );
}

function AdminBookShootFields({
  action,
  pending,
  clients,
  jobs,
  placesConfigured,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  clients: AdminBookClientOption[];
  jobs: AdminBookInterval[];
  placesConfigured: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const intervals = useMemo(
    () => jobs.map((job) => ({ start: new Date(job.start), end: new Date(job.end) })),
    [jobs],
  );
  const clock = time.trim() ? parseAdminShootTime(time) : null;
  const preview = useMemo(() => {
    const day = parseAdminShootDate(date);
    const parsed = parseAdminShootTime(time);
    if (!day || !parsed.ok) return null;
    const start = zonedDateTimeToUtc(DEFAULT_TIMEZONE, { ...day, hour: parsed.hour, minute: parsed.minute });
    return formatAdminShootPreview(start);
  }, [date, time]);
  const window = useMemo(
    () => (services.length > 0 ? adminShootWindow(date, time, services) : null),
    [date, services, time],
  );
  const overlap = window ? shootOverlapWarning(window, intervals) : null;

  return (
    <form action={action} className="flex flex-col gap-4" autoComplete="off">
      <ClientCombobox clients={clients} clientId={clientId} onClientId={setClientId} />
      <AddressAutocomplete placesConfigured={placesConfigured} />
      <ServiceFieldset selected={services} onSelectedChange={setServices} />
      <div className="flex flex-col gap-2">
        <label htmlFor="book-date" className="text-[16px] font-normal text-white">
          Date
        </label>
        <input
          id="book-date"
          name="date"
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none [color-scheme:dark]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="book-time" className="text-[16px] font-normal text-white">
          Time
        </label>
        <input
          id="book-time"
          name="time"
          type="text"
          inputMode="text"
          required
          autoComplete="off"
          placeholder="10:30am"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
        />
        {clock && !clock.ok ? <p className="text-sm text-[#a1a1a1]">{clock.error}</p> : null}
        {preview ? (
          <p className="text-sm text-white" data-testid="shoot-time-preview">
            {preview}
          </p>
        ) : null}
        {overlap ? <p className="text-sm text-[#a1a1a1]">{overlap}</p> : null}
      </div>
      <Field
        id="notes"
        name="notes"
        label="Notes (optional)"
        placeholder="Access info, lockbox, or other information"
      />
      <SubmitButton disabled={!clientId || pending}>{pending ? "Booking…" : "Book shoot"}</SubmitButton>
    </form>
  );
}

function ClientCombobox({
  clients,
  clientId,
  onClientId,
}: {
  clients: AdminBookClientOption[];
  clientId: string;
  onClientId: (id: string) => void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return clients.filter((client) =>
      [client.displayName, client.company, client.inviteCode]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [clients, query]);

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

  function choose(client: AdminBookClientOption) {
    onClientId(client.id);
    setQuery(client.displayName);
    setOpen(false);
    setActiveIndex(-1);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length > 0) {
      setOpen(true);
      setActiveIndex(0);
      event.preventDefault();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (matches.length === 0 ? -1 : (index + 1) % matches.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (matches.length === 0 ? -1 : (index - 1 + matches.length) % matches.length));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const client = matches[activeIndex];
      if (client) choose(client);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showList = open && matches.length > 0;

  return (
    <div ref={rootRef} className="relative z-20 flex flex-col gap-2">
      <label htmlFor="book-client" className="text-[16px] font-normal text-white">
        Client
      </label>
      <input
        id="book-client"
        value={query}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Name, company, or BK code"
        onChange={(event) => {
          setQuery(event.target.value);
          onClientId("");
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (matches.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-12 w-full appearance-none rounded-xl border-0 bg-[#1c1c1e] px-4 text-base text-white outline-none placeholder:text-[#8e8e93]"
      />
      <input type="hidden" name="clientId" value={clientId} />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%-0.25rem)] z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#1c1c1e] py-1 shadow-lg"
        >
          {matches.map((client, index) => {
            const active = index === activeIndex;
            const detail = [client.company?.trim(), client.inviteCode].filter(Boolean).join(" · ");
            return (
              <li key={client.id} role="presentation">
                <button
                  id={`${listId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex min-h-12 w-full flex-col items-start justify-center px-4 py-3 text-left ${
                    active ? "bg-white/10" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(client)}
                >
                  <span className="text-[15px] text-white">{client.displayName}</span>
                  {detail ? <span className="text-sm text-[#8e8e93]">{detail}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
