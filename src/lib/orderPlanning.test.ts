import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, orderDurationSeconds, sortPrintQueue } from "./orderPlanning";
import type { PrintOrder } from "./types";

function order(overrides: Partial<PrintOrder>): PrintOrder {
  return {
    id: crypto.randomUUID(),
    customerName: "Test",
    status: "open",
    priority: "normal",
    dueDate: null,
    notes: "",
    items: [{ printId: "print-a", quantity: 1 }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("queue estimates multiply every saved print duration by its order quantity", () => {
  const planned = order({
    items: [{ printId: "print-a", quantity: 2 }, { printId: "print-b", quantity: 3 }],
  });
  assert.equal(orderDurationSeconds(planned, [
    { id: "print-a", durationSeconds: 900 },
    { id: "print-b", durationSeconds: 600 },
  ]), 3600);
  assert.equal(orderDurationSeconds(planned, [{ id: "print-a", durationSeconds: 900 }]), null);
});

test("initial queue order is due date then priority, manual positions override it", () => {
  const late = order({ dueDate: "2026-12-10", priority: "high" });
  const earlyNormal = order({ dueDate: "2026-12-01", priority: "normal" });
  const earlyHigh = order({ dueDate: "2026-12-01", priority: "high" });
  assert.deepEqual(sortPrintQueue([late, earlyNormal, earlyHigh]), [earlyHigh, earlyNormal, late]);
  assert.deepEqual(sortPrintQueue([
    { ...earlyHigh, queuePosition: 1 },
    { ...late, queuePosition: 0 },
  ]).map((entry) => entry.id), [late.id, earlyHigh.id]);
});

test("duration formatting rounds up partial minutes", () => {
  assert.equal(formatDuration(1), "1m");
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(3661), "1h 2m");
  assert.equal(formatDuration(null), "unknown");
});
