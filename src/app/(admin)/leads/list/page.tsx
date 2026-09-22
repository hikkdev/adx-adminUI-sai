import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadsNav } from "../leads-nav";
import { LeadsListView } from "./leads-list-view";

export const metadata: Metadata = { title: "Leads list" };

/**
 * LH9: the desk's list, moved here from the section's root so the overview
 * can sit there. Suspense because the view reads the facets the overview's
 * rows hand it (`?status=`, `?temperature=`, `?category=`) off the URL.
 */
export default function LeadsListPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <Suspense fallback={null}>
                <LeadsListView />
            </Suspense>
        </div>
    );
}
