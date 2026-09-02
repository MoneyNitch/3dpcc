import type { Language } from "./types";
import { translate } from "./i18n";

export function formatGrams(g: number): string {
  return `${g.toFixed(1)} g`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

export function categoryLabel(category: string, lang: Language): string {
  const key = `category.${category}` as Parameters<typeof translate>[1];
  return translate(lang, key);
}
