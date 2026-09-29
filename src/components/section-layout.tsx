"use client";

import { createContext, useContext } from "react";
import type { SectionLayout } from "@/lib/shoot-layout";

const SectionLayoutContext = createContext<SectionLayout>("grid");

export function SectionLayoutProvider({
  value,
  children,
}: {
  value: SectionLayout;
  children: React.ReactNode;
}) {
  return <SectionLayoutContext.Provider value={value}>{children}</SectionLayoutContext.Provider>;
}

export function useSectionLayout() {
  return useContext(SectionLayoutContext);
}
