import type { Metadata } from "next";
import { api } from "@/services";
import { OrdersTable } from "./orders-table";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
    const orders = await api.orders.list();
    return <OrdersTable orders={orders} />;
}
