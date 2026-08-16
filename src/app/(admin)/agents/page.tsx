import type { Metadata } from "next";
import { api } from "@/services";
import { AgentsTable } from "./agents-table";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
    const agents = await api.agents.list();
    return <AgentsTable agents={agents} />;
}
