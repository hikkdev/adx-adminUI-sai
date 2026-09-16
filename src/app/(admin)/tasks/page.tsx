import type { Metadata } from "next";
import { TasksLoader } from "./tasks-loader";

export const metadata: Metadata = { title: "Tasks" };

/** The DR 10 frame `Tasks · /tasks` — the overview, over the `work` module's `GET /work/overview` (Lot AA). */
export default function TasksPage() {
    return <TasksLoader />;
}
