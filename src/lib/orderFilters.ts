import type { OrderPriority, OrderStatus, PrintOrder } from "./types";

export const dueFilters = ["all", "overdue", "today", "upcoming", "undated"] as const;
export type OrderFilters = {
  customer: string;
  status: "not_completed" | "active" | "all" | OrderStatus;
  priority: "all" | OrderPriority;
  due: (typeof dueFilters)[number];
};

export const defaultOrderFilters: OrderFilters = {
  customer: "", status: "not_completed", priority: "all", due: "all",
};

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isOrderOverdue(order: PrintOrder, today: string): boolean {
  return Boolean(order.dueDate && order.dueDate < today &&
    order.status !== "completed" && order.status !== "cancelled");
}

export function filterOrders(orders: PrintOrder[], filters: OrderFilters, today: string): PrintOrder[] {
  const customer = filters.customer.trim().toLocaleLowerCase();
  return orders.filter((order) => {
    if (!order.customerName.toLocaleLowerCase().includes(customer)) return false;
    if (filters.status === "not_completed") {
      if (order.status === "completed") return false;
    } else if (filters.status === "active") {
      if (order.status === "completed" || order.status === "cancelled") return false;
    } else if (filters.status !== "all" && order.status !== filters.status) return false;
    if (filters.priority !== "all" && (order.priority ?? "normal") !== filters.priority) return false;
    switch (filters.due) {
      case "overdue": return isOrderOverdue(order, today);
      case "today": return order.dueDate === today;
      case "upcoming": return Boolean(order.dueDate && order.dueDate > today);
      case "undated": return !order.dueDate;
      default: return true;
    }
  });
}
