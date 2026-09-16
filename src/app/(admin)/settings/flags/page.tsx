import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsNav } from "../settings-nav";
import { FlagsLoader } from "./flags-loader";

export const metadata: Metadata = { title: "Feature Flags" };

/** Suspense because the loader reads the desk's facets (`?surface=&kind=&source=&state=&owner=&q=`) off the URL. */
export default function FlagsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <Suspense fallback={null}>
                <FlagsLoader />
            </Suspense>
        </div>
    );
}
