import { notFound } from "next/navigation";
import { getPrint, getPrintCostInputs, getSettings } from "@/lib/db";
import { defaultCostInputs } from "@/lib/costCalculator";
import { requireSetupComplete } from "@/lib/setupGuard";
import { CostInputsProvider } from "@/lib/costInputsContext";
import { CostCalculator } from "@/components/CostCalculator";
import { ExtraCostsCard } from "@/components/ExtraCostsCard";
import { PrintInventoryAction } from "@/components/PrintInventoryAction";
import { InvoiceExport } from "@/components/InvoiceExport";
import { DeletePrintButton } from "@/components/DeletePrintButton";
import { PrintNameEditor } from "@/components/PrintNameEditor";
import { PrintDataEditor } from "@/components/PrintDataEditor";
import { ModelPreview } from "@/components/ModelPreview";
import { getIntlLocale, translate } from "@/lib/i18n";
import { PlateSelectionProvider } from "@/lib/plateSelectionContext";
import { PrintPlateSelector } from "@/components/PrintPlateSelector";
import { PrintPlateDetails } from "@/components/PrintPlateDetails";
import { DownloadPrintButton } from "@/components/DownloadPrintButton";
import { originalArchives } from "@/lib/originalArchives";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function PrintDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePage("prints.read");
  const canEdit = hasPermission(user, "prints.write", authEnabled());
  const canDocument = hasPermission(user, "documents.write", authEnabled());
  const { id } = await params;
  const print = await getPrint(id);
  if (!print) notFound();

  const settings = await getSettings();
  requireSetupComplete(settings);
  const lang = settings.general.language;
  const t = (key: Parameters<typeof translate>[1]) =>
    translate(lang, key, undefined, settings.customLanguagePacks);
  // Merge over defaults so older saved cost inputs (pre-dating new fields) stay valid.
  const costInputs = { ...defaultCostInputs(settings), ...(await getPrintCostInputs(id)) };
  const plate = print.plate;
  const archiveSource = print.previewSource ? await getPrint(print.previewSource.printId) : print;
  const hasOriginal = !print.manual && settings.general.retainOriginalArchives && archiveSource !== null &&
    await originalArchives.exists(archiveSource.id);

  return (
    <PlateSelectionProvider plates={print.plates ?? [print.plate]}>
      <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <PrintNameEditor id={print.id} initialName={print.displayName ?? print.fileName} />
          {!print.manual && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{print.fileName}</p>}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(print.manual ? "manual.createdAt" : "print.uploadedAt")}{" "}
            {new Date(print.createdAt).toLocaleString(getIntlLocale(lang))}
          </p>
          <p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
            ID: {print.id}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && <><PrintDataEditor id={print.id} plate={plate} manual={print.manual} materials={settings.materials} />
          <DeletePrintButton id={print.id} /></>}
        </div>
      </div>
      <PrintPlateSelector printId={print.id} />
      {!print.manual && settings.general.retainOriginalArchives && (
        hasOriginal ? <DownloadPrintButton id={print.id} fileName={archiveSource?.fileName ?? print.fileName} /> :
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("print.originalUnavailable")}</p>
      )}

      {plate.hasGcode === false && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t("print.gcodeMissingNote")}
        </p>
      )}

      <CostInputsProvider printId={print.id} initialInputs={costInputs}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
          {((print.plates ?? [plate]).some((item) => item.thumbnailBase64) ||
            (!print.manual && settings.general.enable3dPreview)) && (
            <ModelPreview
              key={print.id}
              printId={print.id}
              thumbnail={plate.thumbnailBase64}
              alt={print.fileName}
              allow3d={!print.manual && settings.general.enable3dPreview}
            />
          )}

          <PrintPlateDetails manual={Boolean(print.manual)} languagePacks={settings.customLanguagePacks} />

          <ExtraCostsCard accessoryMaterials={settings.accessoryMaterials} printId={print.id} />
        </div>

        <div className="min-w-0">
          <CostCalculator printId={print.id} settings={settings} />
          {canDocument && <><InvoiceExport print={print} settings={settings} />
          <InvoiceExport print={print} settings={settings} kind="quote" /></>}
          <PrintInventoryAction printId={print.id} />
        </div>
      </div>
      </CostInputsProvider>
      </div>
    </PlateSelectionProvider>
  );
}
