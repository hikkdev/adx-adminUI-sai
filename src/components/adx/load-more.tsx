"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LoadMoreProps {
    /** Rows on screen. */
    shown: number;
    /** The server's count of the whole, when the read carries one; a cursor read does not, and the line says "so far". */
    total?: number | null;
    /** What a row is called, singular — "attempt", "case". */
    noun: string;
    hasMore: boolean;
    loading?: boolean;
    error?: string | null;
    onLoadMore: () => void;
    className?: string;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * The foot of a cursor/limit read — Q-C item 6: "Showing N of M · Load
 * more". Renders nothing when the whole list is on screen and there is no
 * total to state; with a total it still says how many there are. Pairs
 * with `useCursorPages`.
 */
export function LoadMore({ shown, total = null, noun, hasMore, loading = false, error = null, onLoadMore, className }: LoadMoreProps) {
    if (!hasMore && total === null) return null;
    const count =
        total !== null ? `Showing ${shown} of ${plural(total, noun)}` : hasMore ? `Showing the first ${plural(shown, noun)}` : `Showing all ${plural(shown, noun)}`;
    return (
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground", className)}>
            <span className="tabular-nums">{count}</span>
            {hasMore && (
                <>
                    <span aria-hidden>·</span>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onLoadMore} disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                                Loading…
                            </>
                        ) : (
                            "Load more"
                        )}
                    </Button>
                </>
            )}
            {error && (
                <span role="alert" className="text-danger">
                    {error}
                </span>
            )}
        </div>
    );
}
