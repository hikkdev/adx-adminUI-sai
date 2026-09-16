import type { Metadata } from "next";
import { SupportNav } from "../support-nav";
import { SafetyLoader } from "./safety-loader";

export const metadata: Metadata = { title: "Safety" };

export default function SafetyPage() {
    return (
        <div className="space-y-5">
            <SupportNav />
            <SafetyLoader />
        </div>
    );
}
