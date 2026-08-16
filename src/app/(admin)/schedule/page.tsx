import type { Metadata } from "next";
import { api } from "@/services";
import { ScheduleView } from "./schedule-view";

export const metadata: Metadata = { title: "Schedule" };

export default async function SchedulePage() {
    const [entries, log] = await Promise.all([api.schedule.entries(), api.schedule.log()]);

    return <ScheduleView initialEntries={entries} initialLog={log} />;
}
