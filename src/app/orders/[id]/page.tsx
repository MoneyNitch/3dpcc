import { notFound } from "next/navigation";
import { z } from "zod";
import { OrderDetail } from "@/components/OrderDetail";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { listOrders, getSettings } from "@/lib/db";
import { loadOrderCalculation } from "@/lib/orderCalculationServer";
import { requireSetupComplete } from "@/lib/setupGuard";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("documents.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [orders, settings] = await Promise.all([listOrders(), getSettings()]);
  requireSetupComplete(settings);
  const order = orders.find((item) => item.id === id);
  if (!order) notFound();
  const snapshot = order.calculation ?? await loadOrderCalculation(order);
  return <OrderDetail key={order.updatedAt} initialOrder={order} initialSnapshot={snapshot}
    canEdit={hasPermission(user, "documents.write", authEnabled())} />;
}
