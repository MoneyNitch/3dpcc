import { redirect } from "next/navigation";
import type { AppSettings } from "./types";

export function requireSetupComplete(settings: AppSettings): void {
  if (!settings.setupCompleted) redirect("/settings");
}
