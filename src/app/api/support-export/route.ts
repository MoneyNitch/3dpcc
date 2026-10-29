import AdmZip from "adm-zip";
import { NextRequest, NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { getSettings } from "@/lib/db";
import { getDbConfigView } from "@/lib/dbConfig";
import { getFilamentConnectionsView } from "@/lib/filamentConfig";
import { getPreviewQueue } from "@/lib/previewQueue";

export const runtime = "nodejs";

type BrowserError = {
  timestamp: string;
  type: "error" | "unhandledrejection";
  message: string;
  stack: string;
  page: string;
};

function isBrowserError(value: unknown): value is BrowserError {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.timestamp === "string" &&
    Number.isFinite(Date.parse(entry.timestamp)) &&
    (entry.type === "error" || entry.type === "unhandledrejection") &&
    typeof entry.message === "string" &&
    entry.message.length <= 2000 &&
    typeof entry.stack === "string" &&
    entry.stack.length <= 5000 &&
    typeof entry.page === "string" &&
    entry.page.length <= 500
  );
}

function redactErrorText(value: string) {
  return value
    .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization)\b(\s*[:=]\s*)(\S+)/gi, "$1$2[REDACTED]")
    .replace(/https?:\/\/[^\s)"']+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return "[URL]";
      }
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

async function getDiagnostics() {
  const [settings, database, filamentConnections, queue] = await Promise.all([
    getSettings(),
    Promise.resolve(getDbConfigView()),
    Promise.resolve(getFilamentConnectionsView()),
    getPreviewQueue(),
  ]);
  const jobs = await queue.list();

  return {
    format: "3dpcc-support-report/v1",
    generatedAt: new Date().toISOString(),
    app: {
      version: packageJson.version,
      nextVersion: packageJson.dependencies.next,
      reactVersion: packageJson.dependencies.react,
    },
    server: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      environment: process.env.NODE_ENV ?? "unknown",
    },
    database: {
      driver: database.driver,
      passwordConfigured: database.hasPassword,
    },
    filamentServices: {
      spoolman: {
        configured: Boolean(filamentConnections.spoolman.url),
        apiKeyConfigured: filamentConnections.spoolman.hasApiKey,
      },
      filaman: {
        configured: Boolean(filamentConnections.filaman.url),
        apiKeyConfigured: filamentConnections.filaman.hasApiKey,
      },
    },
    settings: {
      language: settings.general.language,
      currency: settings.general.currency,
      setupCompleted: settings.setupCompleted,
      previewEnabled: settings.general.enable3dPreview,
      previewComputePercent: settings.general.previewComputePercent,
      counts: {
        materials: settings.materials.length,
        accessoryMaterials: settings.accessoryMaterials.length,
        printers: settings.printers.length,
        invoiceTemplates: settings.invoiceTemplates.length,
        quoteTemplates: settings.quoteTemplates.length,
        customLanguagePacks: settings.customLanguagePacks.length,
      },
    },
    previewQueue: {
      total: jobs.length,
      queued: jobs.filter((job) => job.status === "queued").length,
      running: jobs.filter((job) => job.status === "running").length,
      errors: jobs.filter((job) => job.status === "error").length,
      unavailable: jobs.filter((job) => job.status === "unavailable").length,
    },
  };
}

export async function GET() {
  return NextResponse.json(await getDiagnostics(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength > 128_000) {
    return NextResponse.json({ error: "Support report is too large." }, { status: 413 });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: "Request body is required." }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.byteLength;
    if (totalSize > 128_000) {
      await reader.cancel();
      return NextResponse.json({ error: "Support report is too large." }, { status: 413 });
    }
    chunks.push(value);
  }

  let body: Record<string, unknown>;
  try {
    const bytes = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(payload)) throw new Error("Payload must be an object.");
    body = payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const browser = body.browser;
  const issue = body.issue;
  if (
    !isRecord(browser) ||
    !isRecord(issue) ||
    (body.errors !== undefined &&
      (!Array.isArray(body.errors) ||
        body.errors.length > 50 ||
        !body.errors.every(isBrowserError)))
  ) {
    return NextResponse.json({ error: "Invalid support report payload." }, { status: 400 });
  }

  const errors = ((body.errors ?? []) as BrowserError[]).map((error) => ({
    ...error,
    message: redactErrorText(error.message),
    stack: redactErrorText(error.stack),
    page: redactErrorText(error.page),
  }));
  const diagnostics = await getDiagnostics();
  const zip = new AdmZip();
  zip.addFile(
    "diagnostics.json",
    Buffer.from(
      JSON.stringify(
        {
          ...diagnostics,
          browser: {
            userAgent: boundedText(browser.userAgent, 1000),
            language: boundedText(browser.language, 100),
            timeZone: boundedText(browser.timeZone, 100),
            viewport: browser.viewport,
            screen: browser.screen,
            online: typeof browser.online === "boolean" ? browser.online : null,
            page: boundedText(browser.page, 500),
          },
          issue: {
            title: boundedText(issue.title, 120),
            description: boundedText(issue.description, 5000),
            reproductionSteps: boundedText(issue.reproductionSteps, 5000),
          },
        },
        null,
        2,
      ),
      "utf8",
    ),
  );
  zip.addFile("browser-errors.json", Buffer.from(JSON.stringify(errors, null, 2), "utf8"));

  const zipBuffer = zip.toBuffer();
  const responseBody = new Uint8Array(zipBuffer.byteLength);
  responseBody.set(zipBuffer);

  return new NextResponse(responseBody, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="3dpcc-support-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
