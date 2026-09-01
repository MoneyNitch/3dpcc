import { listPrints } from "@/lib/db";
import { UploadForm } from "@/components/UploadForm";
import { PrintCard } from "@/components/PrintCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const prints = await listPrints();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Meine 3D-Drucke</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Lade eine gcode.3mf Datei hoch, um Material, Gewicht und Druckkosten zu berechnen.
        </p>
      </div>

      <UploadForm />

      {prints.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 dark:border-slate-700 dark:text-slate-500">
          Noch keine Drucke gespeichert.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {prints.map((print) => (
            <PrintCard key={print.id} print={print} />
          ))}
        </div>
      )}
    </div>
  );
}

