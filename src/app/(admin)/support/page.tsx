import type { Metadata } from "next";
import { SupportLoader } from "./support-loader";
import { SupportNav } from "./support-nav";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
    return (
        <div className="space-y-5">
            <SupportNav />
            <SupportLoader />
        </div>
    );
}
