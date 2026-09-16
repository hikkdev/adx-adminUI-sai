import type { Metadata } from "next";
import { MilestoneLoader } from "./milestone-loader";

export const metadata: Metadata = { title: "Milestone Editor" };

export default async function MilestonePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <MilestoneLoader id={id} />;
}
