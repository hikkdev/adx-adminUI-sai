import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { CreativeDetail } from "./creative-detail";

export const metadata: Metadata = { title: "Creative Review" };

export default async function CreativeDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const creatives = await api.moderation.creatives();
    const creative = creatives.find((candidate) => candidate.id === id);
    if (!creative) notFound();

    return <CreativeDetail creative={creative} queue={creatives.slice(0, 6)} />;
}
