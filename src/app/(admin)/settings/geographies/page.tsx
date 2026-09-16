import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsNav } from "../settings-nav";
import { GeographiesLoader } from "./geographies-loader";

export const metadata: Metadata = { title: "Geographies" };

/** Suspense because the desk keeps its tab and the Cities facets in the URL (`useSearchParams`). */
export default function GeographiesPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <Suspense fallback={null}>
                <GeographiesLoader />
            </Suspense>
        </div>
    );
}
