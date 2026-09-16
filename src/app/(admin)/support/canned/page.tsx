import type { Metadata } from "next";
import { SupportNav } from "../support-nav";
import { CannedLoader } from "./canned-loader";

export const metadata: Metadata = { title: "Canned replies" };

export default function CannedRepliesPage() {
    return (
        <div className="space-y-5">
            <SupportNav />
            <CannedLoader />
        </div>
    );
}
