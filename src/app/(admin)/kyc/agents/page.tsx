import type { Metadata } from "next";
import { Suspense } from "react";
import { KycNav } from "../kyc-nav";
import { AgentKycLoader } from "./agent-kyc-loader";

export const metadata: Metadata = { title: "Agent KYC" };

/** D4 — the third KYC tab: agents; N3-B: every agent, from the moment the profile exists. Suspense because the loader keeps the state chip in `?state=`. */
export default function AgentKycPage() {
    return (
        <div className="space-y-5">
            <KycNav />
            <Suspense fallback={null}>
                <AgentKycLoader />
            </Suspense>
        </div>
    );
}
