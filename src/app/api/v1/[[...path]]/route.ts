import { NextRequest } from "next/server";
import * as store from "@/lib/db";
import { POST as upload } from "@/app/api/prints/route";
import { POST as splitPlates } from "@/app/api/prints/[id]/plates/route";
import { GET as model, POST as retryModel } from "@/app/api/prints/[id]/model/route";
import { getPreviewQueue } from "@/lib/previewQueue";
import { createOperations } from "@/lib/api/operations";
import { handleDocs } from "@/lib/api/docs";
import { dispatchApi } from "@/lib/api/router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const operations = createOperations({
  store,
  upload: (request) => upload(new NextRequest(request)),
  splitPlates: (request, id) => splitPlates(request, { params: Promise.resolve({ id }) }),
  model: (request, id) => model(request, { params: Promise.resolve({ id }) }),
  retryModel: (request, id) => retryModel(request, { params: Promise.resolve({ id }) }),
  cancelPreview: async (id) => { await (await getPreviewQueue()).cancel(id); },
  settingsChanged: async () => { (await getPreviewQueue()).start(); },
});

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  return dispatchApi(request, path, operations, handleDocs);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;
