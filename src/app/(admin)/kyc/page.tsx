import type { Metadata } from "next";
import { api } from "@/services";
import { KycNav } from "./kyc-nav";
import { KycQueue } from "./kyc-queue";

export const metadata: Metadata = { title: "KYC Queue" };

export default async function KycQueuePage() {
    const cases = await api.kyc.list();

    return (
        <div className="space-y-5">
            <KycNav />
            <KycQueue cases={cases} />
        </div>
    );
}
