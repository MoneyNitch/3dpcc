import { NextResponse } from "next/server";
import { getPrint, getSettings } from "@/lib/db";
import { getPreviewQueue } from "@/lib/previewQueue";

export async function GET() {
  const queue = await getPreviewQueue();
  queue.start();
  const jobs = await queue.list();
  const settings = await getSettings();
  return NextResponse.json({
    paused: !settings.general.enable3dPreview,
    jobs: await Promise.all(jobs.map(async (job) => {
      const print = await getPrint(job.id);
      return { ...job, name: print?.displayName ?? print?.fileName ?? job.id };
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.id) ||
    !("direction" in body) || (body.direction !== "up" && body.direction !== "down")) {
    return NextResponse.json({ error: "Ungültige Änderung der Warteschlange." }, { status: 400 });
  }
  if (!await (await getPreviewQueue()).move(body.id, body.direction)) {
    return NextResponse.json({ error: "Der Auftrag kann nicht mehr verschoben werden. Bitte aktualisieren." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" ||
    !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.id)) {
    return NextResponse.json({ error: "Ungültiger Auftrag." }, { status: 400 });
  }
  await (await getPreviewQueue()).cancel(body.id);
  return NextResponse.json({ ok: true });
}
