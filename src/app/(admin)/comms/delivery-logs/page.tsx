import type { Metadata } from "next";
import { CommsNav } from "../comms-nav";
import { DeliveryLogsView } from "./delivery-logs-view";

export const metadata: Metadata = { title: "Delivery Logs" };

export default function DeliveryLogsPage() {
    return (
        <div className="space-y-5">
            <CommsNav />
            <DeliveryLogsView />
        </div>
    );
}
