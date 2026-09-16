import type { Metadata } from "next";
import { CommsNav } from "../comms-nav";
import { DeliveryLogsLoader } from "./delivery-logs-loader";

export const metadata: Metadata = { title: "Delivery Logs" };

export default function DeliveryLogsPage() {
    return (
        <div className="space-y-5">
            <CommsNav />
            <DeliveryLogsLoader />
        </div>
    );
}
