import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/server";
import { getSettings } from "@/lib/db";
import { productFiles } from "@/lib/productFiles";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "prints.read");
  if (denied) return denied;
  const { id } = await params;
  const product = (await getSettings()).productTypes.find((item) => item.id === id);
  if (!product) return NextResponse.json({ error: "products.error.notFound" }, { status: 404 });
  const file = await productFiles.read(id);
  if (!file) return NextResponse.json({ error: "products.error.fileMissing" }, { status: 404 });
  const fileName = product.fileName.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "") || "product.3mf";
  const encodedName = encodeURIComponent(fileName).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(file), { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="product.3mf"; filename*=UTF-8''${encodedName}`,
    "Content-Length": String(file.byteLength),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
