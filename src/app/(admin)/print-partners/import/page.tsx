import type { Metadata } from "next";
import { PrintPartnersNav } from "../print-partners-nav";
import { ImportLoader } from "./import-loader";

export const metadata: Metadata = { title: "Import print partners" };

/** Package S — the section's Import tab: upload a book of print partners, read the validation report, commit. `?id=` opens one import. */
export default async function ImportPrintPartnersPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const { id } = await searchParams;
    return (
        <div className="space-y-5">
            <PrintPartnersNav />
            <ImportLoader importId={id ?? null} />
        </div>
    );
}
