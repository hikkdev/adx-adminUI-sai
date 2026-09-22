import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { ImportLoader } from "./import-loader";

export const metadata: Metadata = { title: "Import leads" };

/** LH3: the lead sheet on the party import kit — validate with the per-row report, commit, revoke. `?id=` opens one import. */
export default async function ImportLeadsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const { id } = await searchParams;
    return (
        <div className="space-y-5">
            <LeadsNav />
            <ImportLoader importId={id ?? null} />
        </div>
    );
}
