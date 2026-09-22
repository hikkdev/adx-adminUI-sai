import type { Metadata } from "next";
import { ApplicationLoader } from "./application-loader";

export const metadata: Metadata = { title: "Agent application" };

/** AG-3: one application on the desk's workbench. */
export default async function AgentApplicationPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <ApplicationLoader id={id} />;
}
