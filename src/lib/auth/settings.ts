import { isDeepStrictEqual } from "node:util";
import type { AppSettings } from "../types";
import { hasPermission, type Identity } from "./permissions";

export function canUpdateSettings(user: Identity | null, current: AppSettings, next: AppSettings): boolean {
  return (Object.keys(current) as (keyof AppSettings)[]).every((key) =>
    isDeepStrictEqual(current[key], next[key]) ||
    hasPermission(user, ["invoiceTemplates", "quoteTemplates", "numbering"].includes(key) ? "documents.write" : "settings.write")
  );
}
