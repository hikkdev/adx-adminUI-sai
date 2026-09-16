import type { Metadata } from "next";
import { HolidaysLoader } from "./holidays-loader";

export const metadata: Metadata = { title: "Holidays" };

/** The DR 10 frame `Holidays · /employees/holidays`, over `/hr/holidays` — the one HR record kept in-house. */
export default function HolidaysPage() {
    return <HolidaysLoader />;
}
