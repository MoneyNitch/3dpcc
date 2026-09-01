export function formatGrams(g: number): string {
  return `${g.toFixed(1)} g`;
}

export function formatEuro(v: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

export const categoryLabels: Record<string, string> = {
  model: "Modell",
  support: "Stützen",
  tower: "Spülturm",
  other: "Sonstiges",
};
