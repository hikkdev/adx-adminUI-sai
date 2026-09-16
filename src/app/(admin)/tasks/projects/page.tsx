import type { Metadata } from "next";
import { ProjectsLoader } from "./projects-loader";

export const metadata: Metadata = { title: "Projects" };

/** The fourth Tasks tab, `Projects · /tasks/projects`, over `GET /work/projects` (Lot AB, package AB-C). */
export default function TaskProjectsPage() {
    return <ProjectsLoader />;
}
