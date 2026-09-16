import type { Metadata } from "next";
import { ListingsNav } from "../listings-nav";
import { VerificationLoader } from "./verification-loader";

export const metadata: Metadata = { title: "Verification queue" };

export default function VerificationQueuePage() {
    return (
        <div className="space-y-5">
            <ListingsNav />
            <VerificationLoader />
        </div>
    );
}
