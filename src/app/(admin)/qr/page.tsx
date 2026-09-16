import type { Metadata } from "next";
import { Suspense } from "react";
import { QrLoader } from "./qr-loader";

export const metadata: Metadata = { title: "QR codes" };

/** Suspense because the loader keeps the type, active and page facets in the URL (`useSearchParams`). */
export default function QrPage() {
    return (
        <Suspense fallback={null}>
            <QrLoader />
        </Suspense>
    );
}
