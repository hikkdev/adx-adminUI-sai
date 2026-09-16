"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ApiResource } from "@/lib/use-api-resource";

interface ResourceBoundaryProps<T> {
    resource: ApiResource<T>;
    children: (data: T) => React.ReactNode;
    /** Shown when the request succeeds but there is nothing to render. */
    empty?: React.ReactNode;
}

/**
 * Renders the three states every wired screen has: loading, failed, loaded.
 *
 * Kept as one component so the console does not accumulate a different spinner
 * and a different error message per domain as each one comes off fixtures.
 */
export function ResourceBoundary<T>({ resource, children, empty }: ResourceBoundaryProps<T>) {
    const { data, loading, error, reload } = resource;

    if (loading && data === null) {
        return (
            <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading…
            </div>
        );
    }

    if (error) {
        return (
            <Card className="rounded-lg border-danger/40 bg-danger-soft p-5 shadow-none">
                <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">Could not load this view</p>
                        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                        <Button size="sm" variant="outline" className="mt-3" onClick={reload}>
                            Try again
                        </Button>
                    </div>
                </div>
            </Card>
        );
    }

    if (data === null) return <>{empty ?? null}</>;

    return <>{children(data)}</>;
}
