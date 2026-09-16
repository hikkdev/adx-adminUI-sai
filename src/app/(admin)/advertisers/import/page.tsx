import type { Metadata } from "next";
import { AdvertisersNav } from "../advertisers-nav";
import { ImportLoader } from "./import-loader";

export const metadata: Metadata = { title: "Import advertisers" };

/** Package S — the section's Import tab: upload a book of advertisers, read the validation report, commit. `?id=` opens one import. */
export default async function ImportAdvertisersPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const { id } = await searchParams;
    return (
        <div className="space-y-5">
            <AdvertisersNav />
            <ImportLoader importId={id ?? null} />
        </div>
    );
}
