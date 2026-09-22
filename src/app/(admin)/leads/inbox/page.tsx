import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { InboxLoader } from "./inbox-loader";

export const metadata: Metadata = { title: "Inbox" };

/** LH6: the inbound queue by channel — every lead that wrote to us, unanswered first. */
export default function InboxPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <InboxLoader />
        </div>
    );
}
