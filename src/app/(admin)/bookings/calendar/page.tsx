import type { Metadata } from "next";
import { CalendarLoader } from "./calendar-loader";

export const metadata: Metadata = { title: "Booking Calendar" };

export default function BookingCalendarPage() {
    return <CalendarLoader />;
}
