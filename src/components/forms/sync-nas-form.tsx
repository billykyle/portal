"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SubmitButton } from "@/components/field";
import {
  formatNasSyncProgress,
  formatNasSyncSummary,
  nasSyncEmailNote,
  type NasSyncJobPublic,
  type NasSyncStart,
} from "@/lib/nas-sync-job";

type StatusResponse = {
  job: NasSyncJobPublic | null;
  recoveredStale?: boolean;
  error?: string;
};

async function readJob(id: string): Promise<StatusResponse> {
  const response = await fetch(`/api/admin/nas-sync?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  const body = (await response.json()) as StatusResponse;
  if (!response.ok) throw new Error(body.error || "NAS sync failed.");
  return body;
}

export function SyncNasForm({
  initialJob = null,
  error,
  status,
  note,
}: {
  initialJob?: NasSyncJobPublic | null;
  error?: string;
  status?: string;
  note?: string;
}) {
  const [job, setJob] = useState<NasSyncJobPublic | null>(initialJob);
  const [localError, setLocalError] = useState<string | undefined>();
  const [starting, setStarting] = useState(false);
  const running = starting || job?.status === "running";

  const jobId = job?.id;
  const jobStatus = job?.status;

  useEffect(() => {
    if (!jobId || jobStatus !== "running") return;
    let stop = false;
    const tick = async () => {
      try {
        const next = await readJob(jobId);
        if (stop || !next.job) return;
        setJob(next.job);
      } catch (caught) {
        if (stop) return;
        setLocalError(caught instanceof Error ? caught.message : "NAS sync failed.");
      }
    };
    const timer = setInterval(() => void tick(), 2000);
    void tick();
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [jobId, jobStatus]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    setStarting(true);
    setLocalError(undefined);
    try {
      const response = await fetch("/api/admin/nas-sync", { method: "POST", cache: "no-store" });
      const body = (await response.json()) as NasSyncStart & { error?: string };
      if (!response.ok) {
        setLocalError(body.error || "NAS sync failed.");
        return;
      }
      setJob(body.job);
    } catch {
      setLocalError("NAS sync failed.");
    } finally {
      setStarting(false);
    }
  }

  const failed = job?.status === "failed" ? job.error || "NAS sync failed." : undefined;
  const alert = failed ?? localError ?? (job ? undefined : error);
  const progress = job?.status === "running" ? formatNasSyncProgress(job) : undefined;
  const finished = job?.status === "done" && job.summary ? formatNasSyncSummary(job.summary) : undefined;
  const statusText = progress ?? finished ?? (job ? undefined : status);
  const emailNote = job?.summary ? nasSyncEmailNote(job.summary.warnings) : undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <SubmitButton disabled={running}>{running ? "Syncing…" : "Sync from NAS"}</SubmitButton>
      {alert ? (
        <p role="alert" className="text-sm text-white">
          {alert}
        </p>
      ) : null}
      {statusText ? (
        <p role="status" className="text-sm text-white">
          {statusText}
        </p>
      ) : null}
      {emailNote || (!job && note) ? <p className="text-sm text-white">{emailNote ?? note}</p> : null}
    </form>
  );
}
