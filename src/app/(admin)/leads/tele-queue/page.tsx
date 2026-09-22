import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { TeleQueueLoader } from "./tele-queue-loader";

export const metadata: Metadata = { title: "Tele queue" };

/** LH6: the tele-team's queue of cold leads with a number — hottest first, with the last call and any callback due. */
export default function TeleQueuePage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <TeleQueueLoader />
        </div>
    );
}
