import type { Metadata } from "next";
import { api } from "@/services";
import { KycQueue } from "./kyc-queue";

export const metadata: Metadata = { title: "KYC Queue" };

export default async function KycQueuePage() {
    const cases = await api.kyc.list();
    return <KycQueue cases={cases} />;
}
