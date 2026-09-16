import type { Metadata } from "next";
import { AgentsNav } from "../agents-nav";
import { ImportLoader } from "./import-loader";

export const metadata: Metadata = { title: "Import agents" };

/** Package S — the section's Import tab: upload a book of agents, read the validation report, commit. `?id=` opens one import. */
export default async function ImportAgentsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const { id } = await searchParams;
    return (
        <div className="space-y-5">
            <AgentsNav />
            <ImportLoader importId={id ?? null} />
        </div>
    );
}
