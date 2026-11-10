"use client";

import { useState } from "react";
import { useLocale } from "@/lib/locale";
import type { AccessoryMaterial, AccessoryStockMovement } from "@/lib/types";
import type { LabelTemplate } from "@/lib/labelTemplates";
import { AccessoryManager } from "./AccessoryManager";
import { LabelDesigner } from "./LabelDesigner";

export function AccessoryWorkspace({ initialItems, initialMovements, templates, canEdit }: {
  initialItems: AccessoryMaterial[];
  initialMovements: AccessoryStockMovement[];
  templates: LabelTemplate[];
  canEdit: boolean;
}) {
  const { t } = useLocale();
  const [items, setItems] = useState(initialItems);
  const [activeTab, setActiveTab] = useState<"catalog" | "labels">("catalog");
  const [labelItemId, setLabelItemId] = useState(initialItems[0]?.id ?? "");
  const [labelVisited, setLabelVisited] = useState(false);
  return <div className="flex flex-col gap-5">
    <div role="tablist" aria-label={t("settings.accessoryMaterials")} className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
      {(["catalog", "labels"] as const).map((tab) => <button key={tab} id={`accessory-${tab}-tab`} type="button" role="tab"
        aria-selected={activeTab === tab} aria-controls={`accessory-${tab}-panel`}
        className={`border-b-2 px-4 py-3 text-sm font-medium ${activeTab === tab ? "border-orange-500 text-orange-700 dark:text-orange-300" : "border-transparent text-slate-500"}`}
        onClick={() => { if (tab === "labels") setLabelVisited(true); setActiveTab(tab); }}>{t(tab === "catalog" ? "accessories.catalog" : "labels.title")}</button>)}
    </div>
    <div role="tabpanel" id="accessory-catalog-panel" aria-labelledby="accessory-catalog-tab" hidden={activeTab !== "catalog"}>
      <AccessoryManager items={items} onItemsChanged={setItems} initialMovements={initialMovements} canEdit={canEdit}
        onLabel={(id) => { setLabelItemId(id); setLabelVisited(true); setActiveTab("labels"); }} />
    </div>
    {labelVisited && <div role="tabpanel" id="accessory-labels-panel" aria-labelledby="accessory-labels-tab" hidden={activeTab !== "labels"}>
      <LabelDesigner items={items} initialTemplates={templates} itemId={labelItemId} onItemChanged={setLabelItemId} canEdit={canEdit} />
    </div>}
  </div>;
}
