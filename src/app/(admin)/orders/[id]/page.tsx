import type { Metadata } from "next";
import { OrderLoader } from "./order-loader";

export const metadata: Metadata = { title: "Order" };

export default async function OrderDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <OrderLoader id={id} />;
}
