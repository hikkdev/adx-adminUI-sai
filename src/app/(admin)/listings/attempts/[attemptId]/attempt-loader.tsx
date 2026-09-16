"use client";

import Link from "next/link";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { supplyService } from "@/services/supply";
import type { ListingAttempt } from "@/types";
import { AttemptDetail } from "./attempt-detail";

export function AttemptLoader({ attemptId }: { attemptId: string }) {
    const resource = useApiResource<ListingAttempt | null>(`supply:attempt:${attemptId}`, () =>
        supplyService.attempt(attemptId)
    );

    return (
        <ResourceBoundary resource={resource}>
            {(attempt) =>
                attempt ? (
                    <AttemptDetail attempt={attempt} />
                ) : (
                    <div className="py-16 text-center">
                        <p className="text-sm font-medium text-foreground">Attempt not found</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            It may have been abandoned.{" "}
                            <Link href="/listings/attempts" className="text-primary hover:underline">
                                Back to listing attempts
                            </Link>
                        </p>
                    </div>
                )
            }
        </ResourceBoundary>
    );
}
