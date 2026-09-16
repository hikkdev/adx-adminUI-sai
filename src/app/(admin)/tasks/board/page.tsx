import type { Metadata } from "next";
import { BoardLoader } from "./board-loader";

export const metadata: Metadata = { title: "Task Board" };

/** The DR 10 frame `Task board · /tasks/board`, over `GET /work/board` (Lot AA). */
export default function TaskBoardPage() {
    return <BoardLoader />;
}
