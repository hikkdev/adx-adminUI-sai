import type { Metadata } from "next";
import { CreateTaskLoader } from "./create-task-loader";

export const metadata: Metadata = { title: "Create Task" };

/** The DR 10 frame `Create task · /tasks/new`, over `POST /work/tasks` (Lot AA). */
export default function CreateTaskPage() {
    return <CreateTaskLoader />;
}
