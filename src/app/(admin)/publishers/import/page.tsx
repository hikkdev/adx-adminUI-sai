import type { Metadata } from "next";
import { PublishersNav } from "../publishers-nav";
import { ImportLoader } from "./import-loader";

export const metadata: Metadata = { title: "Import Publishers" };

/** Lot D (Q43/Q86) — the legacy book: upload, the validation report, the commit. N3-C: the section's third tab. */
export default async function ImportPublishersPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const { id } = await searchParams;
    return (
        <div className="space-y-5">
            <PublishersNav />
            <ImportLoader importId={id ?? null} />
        </div>
    );
}
