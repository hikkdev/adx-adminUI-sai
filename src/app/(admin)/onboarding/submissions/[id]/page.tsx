import type { Metadata } from "next";
import { IntakeRecordLoader } from "./intake-record-loader";

export const metadata: Metadata = { title: "Intake record" };

/** One intake: what was typed, who it links to, and the decision that brings them into being. */
export default async function IntakeRecordPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <IntakeRecordLoader id={id} />;
}
