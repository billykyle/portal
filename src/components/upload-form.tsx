"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState, type FormEvent } from "react";
import { Field, FormError, SubmitButton } from "@/components/field";
import { BkMark } from "@/components/logo";
import { FormColumn, PhoneShell } from "@/components/phone-shell";
import { cn } from "@/lib/utils";

type Phase = "form" | "uploading" | "done";

type ProgressFile = { name: string; percent: number };

const PREVIEW_PROGRESS: ProgressFile[] = [
  { name: "clip.mov", percent: 64 },
  { name: "notes.pdf", percent: 100 },
];

export function UploadForm({ initial = "form" }: { initial?: Phase }) {
  const [phase, setPhase] = useState<Phase>(initial);
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<ProgressFile[]>(initial === "uploading" ? PREVIEW_PROGRESS : []);
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | File[]) {
    const next = [...files];
    for (const file of list) {
      if (file.size <= 0) continue;
      next.push(file);
    }
    setFiles(next);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (phase !== "form") return;
    setError("");
    if (!label.trim()) {
      setError("Enter what you are uploading.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.includes("..")) {
      setError("Enter a valid email.");
      return;
    }
    if (files.length === 0) {
      setError("Choose a file.");
      return;
    }

    const rows = files.map((file) => ({ name: file.name, percent: 0 }));
    setProgress(rows);
    setPhase("uploading");

    try {
      const sessionRes = await fetch("/api/upload/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          email: email.trim(),
          files: files.map((file) => ({ name: file.name, size: file.size })),
        }),
      });
      const session = (await sessionRes.json()) as {
        error?: string;
        submissionId?: string;
        files?: Array<{ id: string; pathname: string }>;
      };
      if (!sessionRes.ok || !session.submissionId || !session.files) {
        throw new Error(session.error || "Upload is unavailable.");
      }

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const planned = session.files[index];
        if (!planned) throw new Error("Upload is unavailable.");
        await upload(planned.pathname, file, {
          access: "private",
          handleUploadUrl: "/api/upload/blob",
          multipart: true,
          clientPayload: JSON.stringify({ submissionId: session.submissionId, fileId: planned.id }),
          onUploadProgress: ({ percentage }) => {
            setProgress((current) =>
              current.map((row, rowIndex) =>
                rowIndex === index ? { ...row, percent: Math.round(percentage) } : row,
              ),
            );
          },
        });
        setProgress((current) =>
          current.map((row, rowIndex) => (rowIndex === index ? { ...row, percent: 100 } : row)),
        );
      }

      const doneRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: session.submissionId }),
      });
      const done = (await doneRes.json()) as { error?: string; ok?: boolean };
      if (!doneRes.ok || !done.ok) throw new Error(done.error || "Upload is unavailable.");
      setPhase("done");
    } catch (caught) {
      setPhase("form");
      setError(caught instanceof Error ? caught.message : "Upload is unavailable.");
    }
  }

  return (
    <PhoneShell>
      <header className="relative flex min-h-[5.75rem] items-center justify-center py-6">
        <BkMark size="header" />
      </header>
      <div className="flex flex-1 flex-col pb-16 pt-4">
        <FormColumn center>
          <div data-upload-phase={phase}>
            {phase === "done" ? (
              <p role="status" className="text-center text-base text-white">
                Done
              </p>
            ) : phase === "uploading" ? (
              <ul className="flex flex-col gap-4">
                {progress.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3 text-base text-white">
                      <span className="min-w-0 truncate">{file.name}</span>
                      <span className="shrink-0 text-[#8e8e93]">{file.percent}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[#2c2c2e]" role="progressbar" aria-valuenow={file.percent} aria-valuemin={0} aria-valuemax={100} aria-label={file.name}>
                      <div className="h-full bg-white" style={{ width: `${file.percent}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
                <Field
                  id="label"
                  label="What are you uploading?"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  autoComplete="off"
                  required
                />
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
                <div className="flex flex-col gap-2">
                  <span className="text-[16px] font-normal text-white">Files</span>
                  <div
                    className={cn(
                      "flex min-h-28 flex-col items-center justify-center gap-3 rounded-xl bg-[#1c1c1e] px-4 py-6",
                      drag && "outline outline-1 outline-white",
                    )}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDrag(true);
                    }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDrag(false);
                      addFiles(event.dataTransfer.files);
                    }}
                  >
                    <input
                      ref={inputRef}
                      className="sr-only"
                      type="file"
                      multiple
                      aria-label="Files"
                      onChange={(event) => {
                        if (event.target.files) addFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="text-base text-white"
                      onClick={() => inputRef.current?.click()}
                    >
                      Choose files
                    </button>
                    {files.length > 0 ? (
                      <ul className="w-full text-center text-sm text-[#8e8e93]">
                        {files.map((file, index) => (
                          <li key={`${file.name}-${index}`} className="truncate">
                            {file.name}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
                <FormError message={error} />
                <SubmitButton>Upload</SubmitButton>
              </form>
            )}
          </div>
        </FormColumn>
      </div>
    </PhoneShell>
  );
}
