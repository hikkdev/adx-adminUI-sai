import type { Metadata } from "next";
import { ScheduleLoader } from "./schedule-loader";

export const metadata: Metadata = { title: "Schedule" };

/** The DR 10 frame `Schedule · /schedule`, over Lot E's `schedule` module. */
export default function SchedulePage() {
    return <ScheduleLoader />;
}
