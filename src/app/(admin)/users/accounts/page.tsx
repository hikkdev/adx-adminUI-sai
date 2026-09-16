import type { Metadata } from "next";
import { Suspense } from "react";
import { UsersLoader } from "../users-loader";

export const metadata: Metadata = { title: "User accounts" };

/** The accounts directory — the section's second tab since package O-C put the overview at the root. Suspense because the loader keeps the state and role facets in the URL (`useSearchParams`). */
export default function UserAccountsPage() {
    return (
        <Suspense fallback={null}>
            <UsersLoader />
        </Suspense>
    );
}
