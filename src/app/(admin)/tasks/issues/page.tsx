import type { Metadata } from "next";
import { IssuesLoader } from "./issues-loader";

export const metadata: Metadata = { title: "Risk & Issues" };

/** The DR 10 frame `Risk & issues · /tasks/issues`, over `GET /work/issues` (Lot AA). */
export default function TaskIssuesPage() {
    return <IssuesLoader />;
}
