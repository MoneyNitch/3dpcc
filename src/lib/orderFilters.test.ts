import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultOrderFilters, filterOrders, isOrderOverdue, localDateKey, type OrderFilters,
} from "./orderFilters";
import type { PrintOrder } from "./types";

const today = "2026-11-05";
function order(id: string, patch: Partial<PrintOrder> = {}): PrintOrder {
  return {
    id, customerName: "Müller", status: "open", dueDate: "2026-11-04",
    notes: "", items: [], createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z", ...patch,
  };
}
const orders = [
  order("overdue", { priority: "high" }),
  order("today", { status: "in_progress", dueDate: today }),
  order("future", { customerName: "Schmidt", status: "ready", priority: "low", dueDate: "2026-11-06" }),
  order("undated", { customerName: "Schmidt", dueDate: null }),
  order("completed", { status: "completed" }),
  order("cancelled", { status: "cancelled" }),
];
function ids(patch: Partial<OrderFilters> = {}, source = orders) {
  return filterOrders(source, { ...defaultOrderFilters, ...patch }, today).map(({ id }) => id);
}

test("completed orders are excluded by default but can be explicitly shown", () => {
  assert.deepEqual(ids(), ["overdue", "today", "future", "undated", "cancelled"]);
  assert.deepEqual(ids({ status: "all" }), orders.map(({ id }) => id));
  assert.deepEqual(ids({ status: "completed" }), ["completed"]);
  assert.deepEqual(ids({ status: "in_progress" }), ["today"]);
  assert.deepEqual(ids({ status: "cancelled" }), ["cancelled"]);
  assert.deepEqual(ids({ status: "active" }), ["overdue", "today", "future", "undated"]);
});

test("customer search trims whitespace and matches partial names without case sensitivity", () => {
  assert.deepEqual(ids({ customer: " MÜLL " }), ["overdue", "today", "cancelled"]);
  assert.deepEqual(ids({ customer: "midt" }), ["future", "undated"]);
  assert.deepEqual(ids({ customer: "   " }), ids());
  assert.deepEqual(ids({ customer: "missing" }), []);
});

test("priority filtering treats legacy orders without priority as normal", () => {
  assert.deepEqual(ids({ priority: "normal" }), ["today", "undated", "cancelled"]);
  assert.deepEqual(ids({ priority: "high" }), ["overdue"]);
  assert.deepEqual(ids({ priority: "low" }), ["future"]);
});

test("due-date filters separate overdue active orders, today, future and undated orders", () => {
  assert.deepEqual(ids({ status: "all", due: "overdue" }), ["overdue"]);
  assert.deepEqual(ids({ due: "today" }), ["today"]);
  assert.deepEqual(ids({ due: "upcoming" }), ["future"]);
  assert.deepEqual(ids({ due: "undated" }), ["undated"]);
  assert.equal(isOrderOverdue(orders[1], today), false);
  assert.equal(isOrderOverdue(orders[4], today), false);
  assert.equal(isOrderOverdue(orders[5], today), false);
  assert.equal(isOrderOverdue(orders[3], today), false);
  assert.equal(isOrderOverdue(order("ready", { status: "ready" }), today), true);
});

test("filters combine without mutating orders and react to quick status and priority updates", () => {
  const before = structuredClone(orders);
  assert.deepEqual(ids({ customer: "müll", status: "open", priority: "high", due: "overdue" }), ["overdue"]);
  assert.deepEqual(ids({ customer: "müll", status: "ready", priority: "high", due: "overdue" }), []);
  const changed = orders.map((item) => item.id === "overdue" ? { ...item, status: "completed" as const } : item);
  assert.equal(ids({}, changed).includes("overdue"), false);
  assert.deepEqual(ids({ priority: "high" }, changed), []);
  assert.deepEqual(orders, before);
});

test("due dates use the local calendar day and become overdue only on the next day", () => {
  assert.equal(localDateKey(new Date(2026, 0, 2, 0, 5)), "2026-01-02");
  assert.equal(localDateKey(new Date(2026, 10, 5, 23, 59)), today);
  assert.equal(isOrderOverdue(orders[1], "2026-11-06"), true);
  assert.equal(isOrderOverdue(order("previous-year", { dueDate: "2025-12-31" }), "2026-01-01"), true);
});
