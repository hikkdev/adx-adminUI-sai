"use client";

import * as React from "react";
import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { apiConfig } from "@/lib/api-config";
import { useApiResource } from "@/lib/use-api-resource";
import { onboardingBoardSearch, onboardingBoardService, type OnboardingBoard, type OnboardingBoardQuery } from "@/services/reports";
import { BoardView } from "./board-view";

/**
 * QR-14 — the team onboarding board: one read per window and cut, re-read
 * when the operator changes either. The rows are the same the
 * 'onboarding-board' report exports, so the CSV and the screen agree.
 */
export function BoardLoader() {
    const live = apiConfig.live;
    const [query, setQuery] = React.useState<OnboardingBoardQuery>({ preset: "last30" });
    const key = onboardingBoardSearch(query);
    const resource = useApiResource<OnboardingBoard>(`reports:onboarding-board:${key}`, () => onboardingBoardService.read(query));

    if (!live) {
        return (
            <EmptyState
                icon={Trophy}
                title="The board reads the API"
                description="Who onboarded whom is counted on the server. Set NEXT_PUBLIC_USE_API=true and point the console at the ADX backend."
            />
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(board) => <BoardView board={board} query={query} onQuery={setQuery} />}
        </ResourceBoundary>
    );
}
