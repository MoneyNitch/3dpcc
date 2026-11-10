import { z } from "zod";
import type { Customer, PrintOrder } from "./types";

export const customerInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200),
  email: z.union([z.literal(""), z.email().max(254)]),
  phone: z.string().trim().max(100),
  billingAddress: z.string().trim().max(2000),
  shippingAddress: z.string().trim().max(2000),
  notes: z.string().max(5000),
  archived: z.boolean(),
});
export const customerSchema = customerInputSchema.extend({
  id: z.uuid(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export type CustomerInput = z.infer<typeof customerInputSchema>;

export function customerLabel(customer: Pick<Customer, "name" | "company">): string {
  return customer.company ? `${customer.name} · ${customer.company}` : customer.name;
}

export function filterCustomers(customers: Customer[], search: string, includeArchived: boolean): Customer[] {
  const query = search.trim().toLocaleLowerCase();
  return customers.filter((customer) => (includeArchived || !customer.archived) &&
    [customer.name, customer.company, customer.email, customer.phone].some((value) => value.toLocaleLowerCase().includes(query)));
}

export function orderCustomer(customer: Customer | undefined, existing?: PrintOrder) {
  return {
    customerId: customer?.id ?? null,
    customerName: customer
      ? existing?.customerId === customer.id && existing.customerSnapshot ? existing.customerName : customerLabel(customer)
      : existing?.customerName ?? "",
    customerSnapshot: customer
      ? existing?.customerId === customer.id && existing.customerSnapshot ? existing.customerSnapshot : customer
      : undefined,
  };
}
