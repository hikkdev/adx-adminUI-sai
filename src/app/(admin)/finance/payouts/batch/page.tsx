import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { BatchWizard } from "./batch-wizard";

export const metadata: Metadata = { title: "Payout Batch" };

export default async function PayoutBatchPage() {
    const batch = await api.finance.payoutBatch("batch_89");
    if (!batch) notFound();
    return <BatchWizard batch={batch} />;
}
