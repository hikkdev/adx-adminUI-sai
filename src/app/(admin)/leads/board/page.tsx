import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { BoardLoader } from "./board-loader";

export const metadata: Metadata = { title: "Leads board" };

/** LH2: the kanban — a column per stage, per side; drag where the desk may move. */
export default function LeadsBoardPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <BoardLoader />
        </div>
    );
}
