import type { Metadata } from "next";
import { api } from "@/services";
import { BookingsTable } from "./bookings-table";

export const metadata: Metadata = { title: "Bookings" };

export default async function BookingsPage() {
    const bookings = await api.bookings.list();
    return <BookingsTable bookings={bookings} />;
}
