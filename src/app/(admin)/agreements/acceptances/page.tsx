import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptancesLoader } from "./acceptances-loader";

export const metadata: Metadata = { title: "Agreement acceptances" };

/** Suspense because the loader reads `?type=&id=` off the URL to preselect a party. */
export default function AcceptancesPage() {
    return (
        <Suspense fallback={null}>
            <AcceptancesLoader />
        </Suspense>
    );
}
