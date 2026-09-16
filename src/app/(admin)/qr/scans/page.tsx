import type { Metadata } from "next";
import { Suspense } from "react";
import { ScansLoader } from "./scans-loader";

export const metadata: Metadata = { title: "QR scans" };

/** Suspense because the loader reads `?scannedById=` off the URL — the person's page links here with it. */
export default function QrScansPage() {
    return (
        <Suspense fallback={null}>
            <ScansLoader />
        </Suspense>
    );
}
