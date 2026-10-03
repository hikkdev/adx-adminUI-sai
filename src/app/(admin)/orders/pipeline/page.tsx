import type { Metadata } from "next";
import { PipelineLoader } from "./pipeline-loader";
import { OrdersNav } from "../orders-nav";

export const metadata: Metadata = { title: "Order pipeline" };

export default function OrderPipelinePage() {
    return (
        <div className="space-y-5">
            <OrdersNav />
            <PipelineLoader />
        </div>
    );
}
