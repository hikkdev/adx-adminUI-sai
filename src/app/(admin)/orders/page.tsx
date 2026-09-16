import type { Metadata } from "next";
import { OrdersLoader } from "./orders-loader";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
    return <OrdersLoader />;
}
