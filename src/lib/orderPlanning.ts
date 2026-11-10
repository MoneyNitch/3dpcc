import type { PrintOrder } from "./types";

export interface PlannedPrint {
  id: string;
  durationSeconds: number | null;
}

export function orderDurationSeconds(order: PrintOrder, prints: PlannedPrint[]): number | null {
  const durationById = new Map(prints.map((print) => [print.id, print.durationSeconds]));
  let total = 0;
  for (const item of order.items) {
    const duration = durationById.get(item.printId);
    if (duration === undefined || duration === null || !Number.isFinite(duration) || duration < 0) return null;
    total += duration * item.quantity;
  }
  return Number.isFinite(total) ? total : null;
}

const priorityRank = { low: 0, normal: 1, high: 2 } as const;

export function sortPrintQueue(orders: PrintOrder[]): PrintOrder[] {
  return [...orders].sort((left, right) => {
    if (left.queuePosition !== undefined && right.queuePosition !== undefined &&
      left.queuePosition !== right.queuePosition) {
      return left.queuePosition - right.queuePosition;
    }
    if (left.queuePosition !== undefined && right.queuePosition === undefined) return -1;
    if (left.queuePosition === undefined && right.queuePosition !== undefined) return 1;
    const due = (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31");
    if (due) return due;
    const priority = priorityRank[right.priority ?? "normal"] - priorityRank[left.priority ?? "normal"];
    if (priority) return priority;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "unknown";
  const wholeMinutes = Math.ceil(seconds / 60);
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
