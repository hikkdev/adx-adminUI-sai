import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminsLoader } from "./admins-loader";

export const metadata: Metadata = { title: "Admin users" };

/** Suspense because the loader keeps the state facet and the sort in the URL (`useSearchParams`). */
export default function AdminUsersPage() {
    return (
        <Suspense fallback={null}>
            <AdminsLoader />
        </Suspense>
    );
}
