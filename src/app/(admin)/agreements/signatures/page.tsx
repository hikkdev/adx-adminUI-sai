import type { Metadata } from "next";
import { Suspense } from "react";
import { SignaturesLoader } from "./signatures-loader";

export const metadata: Metadata = { title: "Signatures" };

/** Suspense because the loader reads `?partyType=&partyId=` off the URL to land on one party's requests. */
export default function SignaturesPage() {
    return (
        <Suspense fallback={null}>
            <SignaturesLoader />
        </Suspense>
    );
}
