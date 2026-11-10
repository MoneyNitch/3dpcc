import { randomUUID } from "node:crypto";
import { authorize } from "@/lib/auth/server";
import { ApiError, readJson } from "@/lib/api/http";
import { customerInputSchema } from "@/lib/customers";
import { listCustomers, saveCustomer } from "@/lib/db";

export async function GET(request: Request) {
  const denied = await authorize(request, "documents.read");
  if (denied) return denied;
  return Response.json({ customers: await listCustomers() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  try {
    const parsed = customerInputSchema.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "customers.error.input" }, { status: 400 });
    const now = new Date().toISOString();
    const customer = { ...parsed.data, id: randomUUID(), createdAt: now, updatedAt: now };
    if (!(await saveCustomer(customer))) return Response.json({ error: "customers.error.conflict" }, { status: 409 });
    return Response.json({ customer }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: "customers.error.input" }, { status: error.status });
    console.error("Could not create customer:", error);
    return Response.json({ error: "customers.error.save" }, { status: 500 });
  }
}
