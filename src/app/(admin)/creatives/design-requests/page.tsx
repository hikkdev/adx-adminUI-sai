import type { Metadata } from "next";
import { CreativesNav } from "../creatives-nav";
import { DesignRequestsLoader } from "./design-requests-loader";

export const metadata: Metadata = { title: "Design requests" };

/** CR-1: the designs ADX owes — campaigns on the ADX path with nothing standing. */
export default function DesignRequestsPage() {
    return (
        <div className="space-y-5">
            <CreativesNav />
            <DesignRequestsLoader />
        </div>
    );
}
