import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/services";
import { FlowBoard } from "./flow-board";

export const metadata: Metadata = { title: "Flow Board" };

interface FlowBoardPageProps {
    params: Promise<{ key: string }>;
}

export default async function FlowBoardPage({ params }: FlowBoardPageProps) {
    const { key } = await params;
    const flow = await api.flows.get(key);
    if (!flow) notFound();

    return <FlowBoard flow={flow} />;
}
