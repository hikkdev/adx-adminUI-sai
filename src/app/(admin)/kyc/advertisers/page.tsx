import type { Metadata } from "next";
import { api } from "@/services";
import { KycNav } from "../kyc-nav";
import { AdvertiserKycView } from "./advertiser-kyc-view";

export const metadata: Metadata = { title: "Advertiser KYC" };

export default async function AdvertiserKycPage() {
    const cases = await api.advertiserKyc.list();

    return (
        <div className="space-y-5">
            <KycNav />
            <AdvertiserKycView cases={cases} />
        </div>
    );
}
