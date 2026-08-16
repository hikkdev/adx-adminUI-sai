import type { Metadata } from "next";
import { api } from "@/services";
import { PipelineBoard } from "./pipeline-board";

export const metadata: Metadata = { title: "Order Pipeline" };

export default async function OrderPipelinePage() {
    const orders = await api.orders.list();
    return <PipelineBoard orders={orders} />;
}
