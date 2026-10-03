import type { Metadata } from "next";
import { AnalyticsNav } from "../analytics-nav";
import { BoardLoader } from "./onboarding/board-loader";
import { LeaderboardsNav } from "./leaderboards-nav";

export const metadata: Metadata = { title: "Onboarding board" };

/**
 * AN-8: the Leaderboards tab opens on the onboarding board.
 *
 * It was at `/analytics/reports/onboarding-board`, reached only from a tab on
 * Publishers even though each row counts one person's publishers and
 * advertisers together. `next.config.ts` redirects the old path.
 */
export default function LeaderboardsPage() {
    return (
        <div className="space-y-5">
            <AnalyticsNav />
            <LeaderboardsNav />
            <BoardLoader />
        </div>
    );
}
