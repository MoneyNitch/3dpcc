import { redirect } from "next/navigation";
import type { AppFeatures, AppSettings } from "./types";

export function requireSetupComplete(settings: AppSettings): void {
  if (!settings.setupCompleted) redirect("/settings");
}

export function requireFeatureEnabled(settings: AppSettings, feature: keyof AppFeatures): void {
  if (!settings.features[feature]) redirect("/settings");
}
