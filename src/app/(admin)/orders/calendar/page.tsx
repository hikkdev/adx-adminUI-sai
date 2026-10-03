import type { Metadata } from "next";
import { CalendarLoader } from "./calendar-loader";
import { OrdersNav } from "../orders-nav";

export const metadata: Metadata = { title: "Order calendar" };

export default function BookingCalendarPage() {
    /* OM-1: a tab of Orders now — it was /bookings/calendar, and Bookings
       was the same list as Orders drawn a second time. */
    return (
        <div className="space-y-5">
            <OrdersNav />
            <CalendarLoader />
        </div>
    );
}
