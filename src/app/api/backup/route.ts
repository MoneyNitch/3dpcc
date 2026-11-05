import { NextResponse } from "next/server";
import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { BackupError, createBackup, maximumBackupBytes, restoreBackup } from "@/lib/backup";
import { ApiError, parse, privateResponse, readBody, readJson } from "@/lib/api/http";

export const runtime = "nodejs";
export const maxDuration = 300;

const passphraseSchema = z.strictObject({
  passphrase: z.string().min(12).max(256),
});

export async function POST(request: Request) {
  const denied = await authorize(request, "database.manage");
  if (denied) return denied;
  try {
    const { passphrase } = parse(passphraseSchema, await readJson(request));
    const buffer = await createBackup(passphrase);
    const response = new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="3dpcc-backup-${new Date().toISOString().slice(0, 10)}.3dpcc"`,
      },
    });
    return privateResponse(response);
  } catch (error) {
    if (error instanceof BackupError) {
      return privateResponse(NextResponse.json({ error: error.message }, { status: 400 }));
    }
    if (error instanceof ApiError) {
      return privateResponse(NextResponse.json({ error: error.message }, { status: error.status }));
    }
    console.error("Could not create backup:", error);
    return privateResponse(NextResponse.json({ error: "Backup konnte nicht erstellt werden. Prüfe die Serverprotokolle." }, { status: 500 }));
  }
}

export async function PUT(request: Request) {
  const denied = await authorize(request, "database.manage");
  if (denied) return denied;
  const passphrase = request.headers.get("x-3dpcc-backup-password") ?? "";
  if (passphrase.length < 12 || passphrase.length > 256) {
    return privateResponse(NextResponse.json({ error: "Backup-Passwort muss 12 bis 256 Zeichen lang sein." }, { status: 400 }));
  }
  if (!/^application\/octet-stream(?:;|$)/i.test(request.headers.get("content-type") ?? "")) {
    return privateResponse(NextResponse.json({ error: "Bitte eine gültige Backup-Datei übermitteln." }, { status: 415 }));
  }
  try {
    const bytes = await readBody(request, maximumBackupBytes);
    await restoreBackup(Buffer.from(bytes), passphrase);
    return privateResponse(NextResponse.json({ ok: true }));
  } catch (error) {
    if (error instanceof BackupError) {
      return privateResponse(NextResponse.json({ error: error.message }, { status: 400 }));
    }
    if (error instanceof ApiError) {
      return privateResponse(NextResponse.json({ error: error.message }, { status: error.status }));
    }
    console.error("Could not restore backup:", error);
    return privateResponse(NextResponse.json({ error: "Backup konnte nicht wiederhergestellt werden. Prüfe die Serverprotokolle." }, { status: 500 }));
  }
}
