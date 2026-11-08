import assert from "node:assert/strict";
import { test } from "node:test";
import { customerInputSchema, customerLabel, filterCustomers, orderCustomer } from "./customers";
import { orderInputSchema, orderQuickUpdateSchema } from "./orders";
import type { Customer, PrintOrder } from "./types";

const customer: Customer = {
  id: "12345678-1234-4234-8234-123456789abc", name: "Test contact", company: "Print studio",
  email: "contact@example.invalid", phone: "12345", billingAddress: "Billing address",
  shippingAddress: "Shipping address", notes: "Internal note", archived: false,
  createdAt: "2026-11-08T12:00:00Z", updatedAt: "2026-11-08T12:00:00Z",
};

test("customers validate fields and support search and archived filters", () => {
  const { id, createdAt, updatedAt, ...input } = customer;
  assert.ok(id && createdAt && updatedAt);
  assert.equal(customerInputSchema.safeParse(input).success, true);
  for (const patch of [{ name: "" }, { email: "not-email" }, { phone: "x".repeat(101) }, { notes: "x".repeat(5001) }]) {
    assert.equal(customerInputSchema.safeParse({ ...input, ...patch }).success, false);
  }
  const archived = { ...customer, id: "archived", archived: true };
  assert.deepEqual(filterCustomers([customer, archived], "STUDIO", false), [customer]);
  assert.deepEqual(filterCustomers([customer, archived], "example.invalid", true), [customer, archived]);
  assert.equal(filterCustomers([customer], "missing", false).length, 0);
});

test("orders preserve customer contact and label snapshots until reassigned", () => {
  const order: PrintOrder = {
    id: "order", ...orderCustomer(customer), status: "open", dueDate: null, notes: "", items: [],
    createdAt: customer.createdAt, updatedAt: customer.updatedAt,
  };
  const edited = { ...customer, name: "New name", billingAddress: "New address" };
  assert.deepEqual(orderCustomer(edited, order).customerSnapshot, customer);
  assert.equal(orderCustomer(edited, order).customerName, customerLabel(customer));
  const other = { ...edited, id: "other" };
  assert.deepEqual(orderCustomer(other, order).customerSnapshot, other);
  assert.equal(orderCustomer(undefined, order).customerId, null);
  assert.equal(orderCustomer(undefined, order).customerSnapshot, undefined);
});

test("workflow supports old orders and rejects invalid payment and shipping values", () => {
  assert.equal(orderInputSchema.safeParse({
    customerName: "Legacy customer", status: "open", dueDate: null, notes: "",
    items: [{ printId: customer.id, quantity: 1 }],
  }).success, true);
  assert.equal(orderQuickUpdateSchema.safeParse({
    paymentStatus: "paid", paidAmount: 42.5, paymentCurrency: "EUR", paymentMethod: "Card",
    shippingStatus: "shipped", shippingMethod: "Parcel", trackingNumber: "Tracking",
  }).success, true);
  for (const input of [
    {}, { expectedUpdatedAt: customer.updatedAt }, { paidAmount: -1 }, { paidAmount: Infinity },
    { paymentStatus: "unknown" }, { shippingStatus: "unknown" }, { paymentMethod: "x".repeat(101) },
    { paymentCurrency: "unknown" },
  ]) assert.equal(orderQuickUpdateSchema.safeParse(input).success, false);
});
