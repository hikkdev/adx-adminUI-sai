import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { KycWorkbench } from "./kyc-workbench";

export const metadata: Metadata = { title: "KYC Review" };

export default async function KycCasePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const kycCase = await api.kyc.get(id);
    if (!kycCase) notFound();
    return <KycWorkbench kycCase={kycCase} />;
}
