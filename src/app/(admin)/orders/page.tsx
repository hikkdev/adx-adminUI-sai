import type { Metadata } from "next";
import { OrdersLoader } from "./orders-loader";
import { OrdersNav } from "./orders-nav";

export const metadata: Metadata = { title: "Orders" };

/**
 * OM-1: the Orders section's list — with the calendar and the pipeline as
 * its other two tabs. `/bookings` redirects here.
 */
export default function OrdersPage() {
    return (
        <div className="space-y-5">
            <OrdersNav />
            <OrdersLoader />
        </div>
    );
}
