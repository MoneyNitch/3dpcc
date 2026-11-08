import { z } from "zod";
import { authorize } from "@/lib/auth/server";
import { ApiError, readJson } from "@/lib/api/http";
import { customerInputSchema } from "@/lib/customers";
import { listCustomers, saveCustomer } from "@/lib/db";

const updateSchema = customerInputSchema.extend({ expectedUpdatedAt: z.iso.datetime() });

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await authorize(request, "documents.write");
  if (denied) return denied;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "customers.error.notFound" }, { status: 404 });
  try {
    const parsed = updateSchema.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "customers.error.input" }, { status: 400 });
    const existing = (await listCustomers()).find((customer) => customer.id === id);
    if (!existing) return Response.json({ error: "customers.error.notFound" }, { status: 404 });
    const { expectedUpdatedAt, ...input } = parsed.data;
    const customer = {
      ...existing, ...input,
      updatedAt: new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString(),
    };
    if (!(await saveCustomer(customer, expectedUpdatedAt))) {
      return Response.json({ error: "customers.error.conflict" }, { status: 409 });
    }
    return Response.json({ customer }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: "customers.error.input" }, { status: error.status });
    console.error("Could not update customer:", error);
    return Response.json({ error: "customers.error.save" }, { status: 500 });
  }
}
