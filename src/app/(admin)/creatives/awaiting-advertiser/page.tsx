import type { Metadata } from "next";
import { CreativesNav } from "../creatives-nav";
import { AwaitingLoader } from "./awaiting-loader";

export const metadata: Metadata = { title: "Awaiting advertiser" };

/** CR-1: ADX designs delivered and waiting on the advertiser to accept. */
export default function AwaitingAdvertiserPage() {
    return (
        <div className="space-y-5">
            <CreativesNav />
            <AwaitingLoader />
        </div>
    );
}
