import type { Metadata } from "next";
import { PipelineLoader } from "./pipeline-loader";

export const metadata: Metadata = { title: "Order pipeline" };

export default function OrderPipelinePage() {
    return <PipelineLoader />;
}
