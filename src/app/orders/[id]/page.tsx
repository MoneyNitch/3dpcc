import { notFound } from "next/navigation";
import { z } from "zod";
import { OrderDetail } from "@/components/OrderDetail";
import { authEnabled, requirePage } from "@/lib/auth/server";
import { hasPermission } from "@/lib/auth/permissions";
import { getPrintCostInputs, listOrders, getSettings, listPrints } from "@/lib/db";
import { loadOrderCalculation } from "@/lib/orderCalculationServer";
import { requireSetupComplete } from "@/lib/setupGuard";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("documents.read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [orders, settings, prints] = await Promise.all([listOrders(), getSettings(), listPrints()]);
  requireSetupComplete(settings);
  const order = orders.find((item) => item.id === id);
  if (!order) notFound();
  const snapshot = order.calculation ?? await loadOrderCalculation(order);
  const hasAccessoryStockItems = (await Promise.all(order.items.map(async (item) =>
    (await getPrintCostInputs(item.printId))?.extraCosts.some((cost) => cost.accessoryId) ?? false
  ))).some(Boolean);
  const productTypes = settings.productTypes.filter((product) =>
    product.linkedPrintId && order.items.some((item) => item.printId === product.linkedPrintId));
  const serialNumbers = productTypes.flatMap((product) => product.serialNumbers
    .filter((serial) => serial.orderId === order.id)
    .map((serial) => ({ serialNumber: serial.serialNumber, productName: product.name })));
  const orderPrints = order.items.map((item) => ({
    id: item.printId,
    name: prints.find((print) => print.id === item.printId)?.displayName ??
      prints.find((print) => print.id === item.printId)?.fileName ?? item.printId,
    quantity: item.quantity,
  }));
  return <OrderDetail key={order.updatedAt} initialOrder={order} initialSnapshot={snapshot}
    invoiceTemplates={settings.invoiceTemplates} invoiceNumbering={settings.numbering.invoice}
    canEdit={hasPermission(user, "documents.write", authEnabled())} hasAccessoryStockItems={hasAccessoryStockItems}
    canManageSerials={hasPermission(user, "prints.write", authEnabled()) &&
      hasPermission(user, "documents.write", authEnabled())}
    productTypes={productTypes} orderPrints={orderPrints} serialNumbers={serialNumbers} />;
}
