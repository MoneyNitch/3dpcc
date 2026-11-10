"use client";

import { createContext, useContext, useState } from "react";
import type { SoftwareInfo } from "./softwareUpdates";

type UpdateStatus = SoftwareInfo["update"] | null;
const SoftwareUpdateContext = createContext<{
  update: UpdateStatus;
  setUpdate: (update: UpdateStatus) => void;
} | null>(null);

export function SoftwareUpdateProvider({ initialUpdate, children }: {
  initialUpdate: UpdateStatus;
  children: React.ReactNode;
}) {
  const [update, setUpdate] = useState(initialUpdate);
  return <SoftwareUpdateContext.Provider value={{ update, setUpdate }}>{children}</SoftwareUpdateContext.Provider>;
}

export function useSoftwareUpdate() {
  const context = useContext(SoftwareUpdateContext);
  if (!context) throw new Error("useSoftwareUpdate must be used inside SoftwareUpdateProvider");
  return context;
}
