"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import {
    LEADERBOARD_PERIODS,
    growthService,
    type LeaderboardPeriod,
    type LeaderboardView as Board,
} from "@/services/growth";
import { GrowthNav } from "../growth-nav";
import { GrowthOffline } from "../growth-offline";
import { LeaderboardBoard, LeaderboardControls } from "./leaderboard-view";

const TITLE = "Leaderboard";
const SUBTITLE = "Agents ranked by credited incentives, within their city.";

const isPeriod = (value: string | null): value is LeaderboardPeriod =>
    LEADERBOARD_PERIODS.includes(value as LeaderboardPeriod);

/**
 * The board, with the city and the period kept in the URL (`?city=&period=`)
 * so the last city is remembered across a reload and a link to one board
 * lands on it. Nothing is asked of the server until a city is chosen: the
 * endpoint requires one, and a guess would be a board for the wrong roster.
 */
export function LeaderboardLoader() {
    const live = isLive("growth");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();

    const city = params.get("city")?.trim() ?? "";
    const periodParam = params.get("period");
    const period: LeaderboardPeriod = isPeriod(periodParam) ? periodParam : "WEEK";

    const navigate = React.useCallback(
        (next: { city: string; period: LeaderboardPeriod }) => {
            const query = new URLSearchParams();
            if (next.city) query.set("city", next.city);
            if (next.period !== "WEEK") query.set("period", next.period);
            const search = query.toString();
            router.replace(search ? `${pathname}?${search}` : pathname);
        },
        [pathname, router],
    );

    const resource = useApiResource<Board | null>(`growth:leaderboard:${city}:${period}:${live}`, () =>
        live && city ? growthService.leaderboard(city, period) : Promise.resolve(null),
    );

    if (!live) return <GrowthOffline title={TITLE} subtitle={SUBTITLE} />;

    return (
        <div className="space-y-5">
            <PageHeader title={TITLE} subtitle={SUBTITLE} />
            <GrowthNav />
            <LeaderboardControls
                key={city}
                city={city}
                period={period}
                onCityChange={(next) => navigate({ city: next, period })}
                onPeriodChange={(next) => navigate({ city, period: next })}
            />
            {city ? (
                <ResourceBoundary resource={resource}>
                    {(board) => (board ? <LeaderboardBoard board={board} /> : null)}
                </ResourceBoundary>
            ) : (
                <EmptyState
                    icon={Trophy}
                    title="Pick a city"
                    description="The cohort is a city's whole roster, with the same ten-agent floor the rating's percentile uses. Type one above to see its board."
                />
            )}
        </div>
    );
}
