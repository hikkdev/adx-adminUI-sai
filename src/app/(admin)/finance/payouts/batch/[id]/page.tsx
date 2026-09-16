import type { Metadata } from "next";
import { BatchLoader } from "./batch-loader";

export const metadata: Metadata = { title: "Payout Batch" };

export default async function PayoutBatchPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <BatchLoader id={id} />;
}
