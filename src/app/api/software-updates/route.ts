import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson } from "@/lib/api/http";
import { authorize } from "@/lib/auth/server";
import { getSettings, updateSettings } from "@/lib/db";
import { softwareUpdates } from "@/lib/softwareUpdates";

const preferencesSchema = z.strictObject({
  fetchGithubChangelog: z.boolean(),
  checkGithubUpdates: z.boolean(),
});

async function information(request: Request, refresh: boolean) {
  const denied = await authorize(request, "settings.read");
  if (denied) return denied;
  try {
    const settings = await getSettings();
    const info = await softwareUpdates.getInfo(settings.general, refresh);
    return NextResponse.json(info, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not load software information:", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export async function GET(request: Request) { return information(request, false); }
export async function POST(request: Request) { return information(request, true); }

export async function PUT(request: Request) {
  const denied = await authorize(request, "settings.write");
  if (denied) return denied;
  try {
    const preferences = preferencesSchema.safeParse(await readJson(request));
    if (!preferences.success) return NextResponse.json({ error: "input" }, { status: 400 });
    await updateSettings((settings) => ({ ...settings, general: { ...settings.general, ...preferences.data } }));
    return NextResponse.json({ preferences: preferences.data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: "input" }, { status: error.status });
    console.error("Could not save GitHub preferences:", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
