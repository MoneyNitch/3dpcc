import { getPrint, getSettings } from "@/lib/db";
import { originalArchives, originalDownload } from "@/lib/originalArchives";
import { errorResponse } from "@/lib/api/http";
import { authorize } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(_request, "prints.read");
  if (denied) return denied;
  try {
    const { id } = await params;
    return await originalDownload(id, {
      enabled: async () => (await getSettings()).general.retainOriginalArchives,
      getPrint,
      archives: originalArchives,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
