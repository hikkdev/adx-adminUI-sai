import type { Metadata } from "next";
import { BookingsLoader } from "./bookings-loader";

export const metadata: Metadata = { title: "Bookings" };

/**
 * A client loader rather than an async server fetch: the API client keeps its
 * token in the browser, so the orders have to be read from there.
 */
export default function BookingsPage() {
    return <BookingsLoader />;
}
