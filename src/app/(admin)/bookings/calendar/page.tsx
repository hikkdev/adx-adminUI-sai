import type { Metadata } from "next";
import { BookingCalendar } from "./booking-calendar";

export const metadata: Metadata = { title: "Booking Calendar" };

export default function BookingCalendarPage() {
    return <BookingCalendar />;
}
