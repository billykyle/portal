"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "bk_maintenance";

export function MaintenanceBanner({ message, token }: { message: string; token: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === token) setVisible(false);
  }, [token]);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-[#1c1c1e] px-3 py-2 text-sm text-white">
      <p className="min-w-0 leading-5">{message}</p>
      <button
        type="button"
        className="shrink-0 text-[#8e8e93]"
        onClick={() => {
          sessionStorage.setItem(STORAGE_KEY, token);
          setVisible(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
