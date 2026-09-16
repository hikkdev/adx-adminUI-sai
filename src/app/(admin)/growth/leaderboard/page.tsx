import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardLoader } from "./leaderboard-loader";

export const metadata: Metadata = { title: "Leaderboard" };

/**
 * `useSearchParams` in the loader needs a Suspense boundary above it, or the
 * static build bails out of prerendering the whole page.
 */
export default function LeaderboardPage() {
    return (
        <Suspense fallback={null}>
            <LeaderboardLoader />
        </Suspense>
    );
}
