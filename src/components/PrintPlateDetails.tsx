"use client";

import { useMemo } from "react";
import type { LanguagePack, ObjectBreakdown } from "@/lib/types";
import { categoryLabel, formatDuration, formatGrams } from "@/lib/format";
import { useLocale } from "@/lib/locale";
import { usePlateSelection } from "@/lib/plateSelectionContext";

export function PrintPlateDetails({
  manual,
  languagePacks,
}: {
  manual: boolean;
  languagePacks: LanguagePack[];
}) {
  const { plates, plate, allSelected } = usePlateSelection();
  const { t, lang } = useLocale();
  const details = useMemo(() => {
    if (!allSelected) {
      return {
        totalWeightGrams: plate.totalWeightGrams,
        totalPrintTimeSeconds: plate.totalPrintTimeSeconds,
        layerCount: plate.layerCount,
        filaments: plate.filaments,
        categoryTotals: plate.categoryTotals,
        objects: plate.objects.map((object) => ({ object, plateName: null as string | null })),
        hasAnyGcode: plate.hasGcode !== false,
        hasCompleteGcode: plate.hasGcode !== false,
        categoryGramsByFilament: new Map(
          plate.filaments.map((filament) => {
            const breakdown = plate.categoryByFilament?.find(
              (item) => item.filamentId === filament.filamentId
            );
            return [
              filamentKey(filament),
              new Map(breakdown?.categories.map((category) => [category.category, category.grams]) ?? []),
            ];
          })
        ),
      };
    }

    const filamentTotals = new Map<string, (typeof plate.filaments)[number]>();
    const categoryTotals = new Map<string, number>();
    const categoryGramsByFilament = new Map<string, Map<string, number>>();
    const objects: { object: ObjectBreakdown; plateName: string }[] = [];

    for (const [index, sourcePlate] of plates.entries()) {
      const plateName = sourcePlate.plateName || t("print.plateNumber", {
        number: sourcePlate.plateIndex ?? index + 1,
      });
      objects.push(...sourcePlate.objects.map((object) => ({ object, plateName })));

      for (const category of sourcePlate.categoryTotals) {
        categoryTotals.set(category.category, (categoryTotals.get(category.category) ?? 0) + category.grams);
      }

      for (const filament of sourcePlate.filaments) {
        const key = filamentKey(filament);
        const existing = filamentTotals.get(key);
        if (existing) {
          existing.usedGramsTotal += filament.usedGramsTotal;
          existing.usedMetersTotal += filament.usedMetersTotal;
        } else {
          filamentTotals.set(key, { ...filament });
        }

        const categoryGrams = categoryGramsByFilament.get(key) ?? new Map<string, number>();
        const breakdown = sourcePlate.categoryByFilament?.find(
          (item) => item.filamentId === filament.filamentId
        );
        for (const category of breakdown?.categories ?? []) {
          categoryGrams.set(category.category, (categoryGrams.get(category.category) ?? 0) + category.grams);
        }
        categoryGramsByFilament.set(key, categoryGrams);
      }
    }

    return {
      totalWeightGrams: plates.reduce((total, item) => total + item.totalWeightGrams, 0),
      totalPrintTimeSeconds: plates.reduce((total, item) => total + item.totalPrintTimeSeconds, 0),
      layerCount: plates.reduce((total, item) => total + item.layerCount, 0),
      filaments: [...filamentTotals.entries()].map(([key, filament]) => ({ key, ...filament })),
      categoryTotals: [...categoryTotals].map(([category, grams]) => ({ category, grams })),
      objects,
      hasAnyGcode: plates.some((item) => item.hasGcode !== false),
      hasCompleteGcode: plates.every((item) => item.hasGcode !== false),
      categoryGramsByFilament,
    };
  }, [allSelected, plate, plates, t]);

  return (
    <>
      <div className={`grid gap-3 text-center ${manual ? "grid-cols-2" : "grid-cols-3"}`}>
        <Stat label={t("print.totalWeight")} value={formatGrams(details.totalWeightGrams)} />
        <Stat label={t("print.printTime")} value={formatDuration(details.totalPrintTimeSeconds)} />
        {!manual && <Stat label={t("print.layers")} value={String(details.layerCount)} />}
      </div>

      {allSelected && !details.hasCompleteGcode && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t("print.allPlateGcodeMissing")}
        </p>
      )}

      {details.hasAnyGcode && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("print.weightByPart")}</h2>
          <table className="mt-3 w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 dark:text-slate-500">
                <th className="py-1.5 font-medium">{t("print.category")}</th>
                {details.filaments.map((filament) => (
                  <th key={filamentKey(filament)} className="py-1.5 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <span className="h-3 w-3 rounded-full border border-slate-300 dark:border-slate-600" style={{ backgroundColor: filament.color }} />
                      {filament.type}
                    </span>
                  </th>
                ))}
                <th className="py-1.5 text-right font-medium">{t("print.total")}</th>
              </tr>
            </thead>
            <tbody>
              {details.categoryTotals.map((category) => (
                <tr key={category.category} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="py-1.5 text-slate-600 dark:text-slate-300">
                    {categoryLabel(category.category, lang, languagePacks)}
                  </td>
                  {details.filaments.map((filament) => {
                    const grams = details.categoryGramsByFilament
                      .get(filamentKey(filament))
                      ?.get(category.category) ?? 0;
                    return <td key={filamentKey(filament)} className="py-1.5 text-right text-slate-500 dark:text-slate-400">{formatGrams(grams)}</td>;
                  })}
                  <td className="py-1.5 text-right font-medium dark:text-slate-100">{formatGrams(category.grams)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-300 font-semibold dark:border-slate-600 dark:text-slate-100">
                <td className="py-1.5">{t("print.total")}</td>
                {details.filaments.map((filament) => (
                  <td key={filamentKey(filament)} className="py-1.5 text-right">{formatGrams(filament.usedGramsTotal)}</td>
                ))}
                <td className="py-1.5 text-right">{formatGrams(details.totalWeightGrams)}</td>
              </tr>
            </tbody>
          </table>
          {!manual && <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{t("print.weightEstimateNote")}</p>}
        </section>
      )}

      {details.hasAnyGcode && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {t(allSelected ? "print.objectsOnAllPlates" : "print.objectsOnPlate")}
          </h2>
          <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
            {details.objects.map(({ object, plateName }) => (
              <div key={`${plateName ?? "selected"}:${object.objectId}`} className="py-3">
                <div className="flex justify-between">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {object.name}
                    {plateName && <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">{plateName}</span>}
                  </span>
                  <span className="font-medium dark:text-slate-100">{formatGrams(object.totalGrams)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500 dark:text-slate-400">
                  {object.maxHeightMm !== null && <span>{t("print.height")}: {object.maxHeightMm.toFixed(2)} mm</span>}
                  {object.categories.map((category) => (
                    <span key={category.category}>
                      {categoryLabel(category.category, lang, languagePacks)}: {formatGrams(category.grams)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t("print.filamentsColors")}</h2>
        <div className="mt-3 flex flex-col divide-y divide-slate-100 dark:divide-slate-700">
          {details.filaments.map((filament) => (
            <div key={filamentKey(filament)} className="flex items-center gap-3 py-2 text-sm">
              <span className="h-5 w-5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600" style={{ backgroundColor: filament.color }} />
              <span className="flex-1 text-slate-700 dark:text-slate-200">
                {filament.type} <span className="text-slate-400 dark:text-slate-500">{filament.color}</span>
              </span>
              <span className="text-slate-500 dark:text-slate-400">{filament.usedMetersTotal.toFixed(2)} m</span>
              <span className="font-medium dark:text-slate-100">{formatGrams(filament.usedGramsTotal)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function filamentKey(filament: { filamentId: string; type: string; color: string }) {
  return JSON.stringify([filament.filamentId, filament.type, filament.color]);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
