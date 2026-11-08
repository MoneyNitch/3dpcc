import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { migrateSettings } from "@/lib/db/shared";
import { getPreviewQueue } from "@/lib/previewQueue";
import { isCurrencyCode } from "@/lib/currency";
import { parseLanguagePack } from "@/lib/i18n";
import type { LanguagePack } from "@/lib/types";
import { authEnabled, authorize, requestIdentity } from "@/lib/auth/server";
import { canUpdateSettings } from "@/lib/auth/settings";

export async function GET(request: Request) {
  const denied = await authorize(request, ["settings.read", "documents.read", "prints.read"]);
  if (denied) return denied;
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(req: NextRequest) {
  const denied = await authorize(req, ["settings.write", "documents.write"]);
  if (denied) return denied;
  const body = await req.json();
  if (body?.customLanguagePacks !== undefined && !Array.isArray(body.customLanguagePacks)) {
    return NextResponse.json({ error: "Sprachpakete müssen als Liste übermittelt werden." }, { status: 400 });
  }
  let customLanguagePacks: LanguagePack[];
  try {
    const rawLanguagePacks = body?.customLanguagePacks ?? [];
    if (rawLanguagePacks.length > 20) {
      return NextResponse.json({ error: "Es können höchstens 20 Sprachpakete gespeichert werden." }, { status: 400 });
    }
    customLanguagePacks = rawLanguagePacks.map(parseLanguagePack);
    if (JSON.stringify(customLanguagePacks).length > 2_000_000) {
      return NextResponse.json({ error: "Die Sprachpakete sind insgesamt zu groß." }, { status: 400 });
    }
    if (new Set(customLanguagePacks.map((pack) => pack.code)).size !== customLanguagePacks.length) {
      return NextResponse.json({ error: "Jeder Sprachcode darf nur einmal vorkommen." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ungültiges Sprachpaket.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const language = body?.general?.language;
  if (
    language !== undefined &&
    (typeof language !== "string" ||
      (language !== "de" && language !== "en" && !customLanguagePacks.some((pack) => pack.code === language)))
  ) {
    return NextResponse.json({ error: "Die ausgewählte Sprache ist nicht installiert." }, { status: 400 });
  }
  if (body?.general?.currency !== undefined && !isCurrencyCode(body.general.currency)) {
    return NextResponse.json({ error: "Bitte wähle eine unterstützte Währung aus." }, { status: 400 });
  }
  if (body?.general?.enable3dPreview !== undefined && typeof body.general.enable3dPreview !== "boolean") {
    return NextResponse.json({ error: "Die 3D-Vorschau muss aktiviert oder deaktiviert sein." }, { status: 400 });
  }
  if (body?.general?.retainOriginalArchives !== undefined && typeof body.general.retainOriginalArchives !== "boolean") {
    return NextResponse.json({ error: "Die Aufbewahrung von Originalarchiven muss aktiviert oder deaktiviert sein." }, { status: 400 });
  }
  for (const field of ["fetchGithubChangelog", "checkGithubUpdates"] as const) {
    if (body?.general?.[field] !== undefined && typeof body.general[field] !== "boolean") {
      return NextResponse.json({ error: "Die GitHub-Funktionen müssen aktiviert oder deaktiviert sein." }, { status: 400 });
    }
  }
  const duty = body?.general?.previewComputePercent;
  if (duty !== undefined && (typeof duty !== "number" || !Number.isInteger(duty) || duty < 10 || duty > 100)) {
    return NextResponse.json({ error: "Die Hintergrund-Rechenleistung muss zwischen 10 und 100 liegen." }, { status: 400 });
  }
  const next = migrateSettings(body);
  const currentSettings = await getSettings();
  const retainedAccessoryIds = new Set(next.accessoryMaterials.map((item) => item.id));
  if (currentSettings.accessoryMaterials.some((item) =>
    item.stockQuantity > 0 && !retainedAccessoryIds.has(item.id)
  )) {
    return NextResponse.json({
      error: "Zubehör mit vorhandenem Lagerbestand kann nicht entfernt werden. Buche den Bestand vorher aus.",
    }, { status: 409 });
  }
  if (authEnabled()) {
    const user = await requestIdentity(req, true);
    if (!canUpdateSettings(user, currentSettings, next)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }
  await saveSettings(next);
  (await getPreviewQueue()).start();
  return NextResponse.json({ ok: true });
}
