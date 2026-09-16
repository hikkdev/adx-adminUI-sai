"use client";

import { RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { formatDateTime } from "@/lib/format";
import { changeSummary, changedByLabel, flagsService, rolloutRulesLabel, type FlagChange } from "@/services/flags";

interface FlagHistoryProps {
    flagKey: string | null;
    onOpenChange: (open: boolean) => void;
}

/**
 * `GET /flags/:key/changes` — newest first, capped at 50 by the server.
 * Each row names what moved against the row below it: the switch, the
 * percentage, the variant, the rules — and a rollback is named as one,
 * with the change it undid.
 */
export function FlagHistory({ flagKey, onOpenChange }: FlagHistoryProps) {
    return (
        <Sheet open={flagKey !== null} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[480px]">
                {flagKey && (
                    <>
                        <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
                            <SheetTitle className="text-base">
                                <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{flagKey}</code>
                            </SheetTitle>
                            <SheetDescription>Every time this flag moved, newest first. The last fifty.</SheetDescription>
                        </SheetHeader>
                        <div className="px-5 py-4">
                            <HistoryList flagKey={flagKey} />
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}

function HistoryList({ flagKey }: { flagKey: string }) {
    const resource = useApiResource<FlagChange[]>(`flags:changes:${flagKey}`, () => flagsService.changes(flagKey));

    return (
        <ResourceBoundary resource={resource}>
            {(changes) =>
                changes.length ? (
                    <ol className="space-y-4">
                        {changes.map((change, index) => {
                            /* Newest first, so the state before this one is the next row down. */
                            const previous = changes[index + 1] ?? null;
                            const undone = change.rollbackOfId ? changes.find((row) => row.id === change.rollbackOfId) : null;
                            const rules = rolloutRulesLabel(change.rollout);
                            return (
                                <li key={change.id} className="border-l pl-4 text-sm">
                                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                                        {change.rollbackOfId && <RotateCcw className="size-3.5 text-muted-foreground" aria-hidden />}
                                        {changeSummary(change, previous)}
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {formatDateTime(change.at)} · {changedByLabel(change)}
                                    </p>
                                    {change.rollbackOfId && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            Undid {undone ? `the change of ${formatDateTime(undone.at)} by ${changedByLabel(undone)}` : "an earlier change"}.
                                        </p>
                                    )}
                                    {(change.variant || rules) && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            {[change.variant ? `Variant ${change.variant}` : null, rules ? `Rules: ${rules}` : null].filter(Boolean).join(" · ")}
                                        </p>
                                    )}
                                    {change.note && <p className="mt-1 text-muted-foreground">{change.note}</p>}
                                </li>
                            );
                        })}
                    </ol>
                ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">This flag has never been moved.</p>
                )
            }
        </ResourceBoundary>
    );
}
