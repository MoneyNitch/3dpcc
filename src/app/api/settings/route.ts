import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  await saveSettings(body);
  return NextResponse.json({ ok: true });
}
