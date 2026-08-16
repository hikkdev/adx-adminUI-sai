import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { MilestoneEditor } from "./milestone-editor";

export const metadata: Metadata = { title: "Milestone Editor" };

export default async function MilestonePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const [milestone, milestones] = await Promise.all([
        api.growth.milestone(id),
        api.growth.milestones(),
    ]);
    if (!milestone) notFound();
    return <MilestoneEditor milestones={milestones} activeId={milestone.id} />;
}
