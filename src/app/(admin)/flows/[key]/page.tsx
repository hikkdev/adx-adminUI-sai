import type { Metadata } from "next";
import { FlowBoardLoader } from "./flow-board-loader";

export const metadata: Metadata = { title: "Flow Board" };

interface FlowBoardPageProps {
    params: Promise<{ key: string }>;
}

export default async function FlowBoardPage({ params }: FlowBoardPageProps) {
    const { key } = await params;
    return <FlowBoardLoader flowKey={decodeURIComponent(key)} />;
}
