"use client";

import { Field, FormError, FormSuccess, SubmitButton } from "@/components/field";
import {
  clearMaintenanceNoticeAction,
  emailMaintenanceNoticeAction,
  saveMaintenanceNoticeAction,
} from "@/lib/actions/maintenance";

const quietButtonClass =
  "flex h-12 w-full appearance-none items-center justify-center rounded-xl border-0 bg-[#1c1c1e] text-base font-medium text-white disabled:text-white/35";

export function MaintenanceNoticeForm({
  message,
  startsAt,
  endsAt,
  saved,
  cleared,
  emailed,
  error,
}: {
  message: string;
  startsAt: string;
  endsAt: string;
  saved?: string;
  cleared?: string;
  emailed?: string;
  error?: string;
}) {
  const hasNotice = Boolean(message && startsAt && endsAt);

  return (
    <div className="flex flex-col gap-4">
      <form action={saveMaintenanceNoticeAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="message" className="text-[16px] font-normal text-white">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={3}
            required
            defaultValue={message}
            className="rounded-xl border-0 bg-[#1c1c1e] px-4 py-3 text-base text-white outline-none"
          />
        </div>
        <Field
          id="startsAt"
          label="Starts (ET)"
          type="datetime-local"
          required
          defaultValue={startsAt}
          className="scheme-dark"
        />
        <Field
          id="endsAt"
          label="Ends (ET)"
          type="datetime-local"
          required
          defaultValue={endsAt}
          className="scheme-dark"
        />
        <FormError message={error} />
        <FormSuccess message={saved} />
        <SubmitButton>Save</SubmitButton>
      </form>
      <form action={clearMaintenanceNoticeAction}>
        <FormSuccess message={cleared} />
        <button type="submit" className={quietButtonClass}>
          Clear
        </button>
      </form>
      <form action={emailMaintenanceNoticeAction}>
        <FormSuccess message={emailed} />
        <button
          type="submit"
          disabled={!hasNotice}
          className={quietButtonClass}
          onClick={(event) => {
            if (!window.confirm("Email this notice to all clients?")) event.preventDefault();
          }}
        >
          Email all clients
        </button>
      </form>
    </div>
  );
}
