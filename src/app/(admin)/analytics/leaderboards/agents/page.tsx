import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardLoader } from "./leaderboard-loader";

export const metadata: Metadata = { title: "Agent leaderboard" };

/**
 * AN-8: the city board, moved out of Growth CMS — which is the milestone and
 * tier *configuration* — and in beside the onboarding board, because both
 * rank people by what they brought in. `next.config.ts` redirects
 * `/growth/leaderboard`.
 *
 * `useSearchParams` in the loader needs a Suspense boundary above it, or the
 * static build bails out of prerendering the whole page.
 */
export default function AgentLeaderboardPage() {
    return (
        <Suspense fallback={null}>
            <LeaderboardLoader />
        </Suspense>
    );
}
