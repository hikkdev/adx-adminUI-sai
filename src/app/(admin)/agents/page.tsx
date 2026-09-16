import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentsOverviewView } from "./agents-overview";

export const metadata: Metadata = { title: "Agents" };

/**
 * The section's landing tab — package O-C: the overview over
 * `GET /section-overviews/agents`. The roster moved to `/agents/directory`.
 * Suspense because the loader keeps the window in the URL.
 */
export default function AgentsPage() {
    return (
        <Suspense fallback={null}>
            <AgentsOverviewView />
        </Suspense>
    );
}
