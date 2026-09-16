import type { Metadata } from "next";
import { AssignmentsLoader } from "./assignments-loader";

export const metadata: Metadata = { title: "Request assignments" };

export default function AssignmentsPage() {
    return <AssignmentsLoader />;
}
