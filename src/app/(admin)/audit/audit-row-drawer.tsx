"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FieldList } from "@/components/adx/simple-table";
import { formatDateTime } from "@/lib/format";
import { actionLabel, actorName, cellText, diffRows, moduleLabel, type AuditRow } from "@/services/audit";

interface AuditRowDrawerProps {
    row: AuditRow | null;
    onOpenChange: (open: boolean) => void;
    /** Pins the list to every row about this record. */
    onShowTimeline: (target: { type: string; id: string }) => void;
}

/**
 * One audit row, opened.
 *
 * The table shows what fits in a line; this shows the rest — the request
 * id that ties the row to a log line, the user agent, the metadata the
 * module attached, and the before/after diff where the money and status
 * models wrote one. The diff is a table because that is what it is: a
 * field, what it was, what it became. Values arrive already masked; nothing
 * is unmasked here.
 */
export function AuditRowDrawer({ row, onOpenChange, onShowTimeline }: AuditRowDrawerProps) {
    const changes = diffRows(row?.diff);
    const metadata = row?.metadata ? Object.entries(row.metadata) : [];

    return (
        <Sheet open={row !== null} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
                {row && (
                    <>
                        <SheetHeader className="space-y-1 border-b px-5 py-4 text-left">
                            <SheetTitle className="text-base">{actionLabel(row.action)}</SheetTitle>
                            <SheetDescription>
                                {actorName(row)} · {formatDateTime(row.createdAt)}
                            </SheetDescription>
                        </SheetHeader>

                        <div className="space-y-6 px-5 py-5">
                            <FieldList
                                items={[
                                    ["Module", moduleLabel(row.module)],
                                    ["Action", <span key="a" className="font-mono text-xs">{row.action}</span>],
                                    [
                                        "Target",
                                        row.targetType ? (
                                            <span key="t">
                                                {row.targetType}
                                                {row.targetId && (
                                                    <>
                                                        {" · "}
                                                        <span className="font-mono text-xs">{row.targetId}</span>
                                                    </>
                                                )}
                                            </span>
                                        ) : (
                                            "—"
                                        ),
                                    ],
                                    ["Actor", row.user?.email ?? row.userId],
                                    ["IP", row.ipAddress ?? "—"],
                                    ["Request", <span key="r" className="font-mono text-xs">{row.requestId ?? "—"}</span>],
                                ]}
                            />
                            {row.userAgent && (
                                <p className="break-all text-xs text-muted-foreground">{row.userAgent}</p>
                            )}

                            {row.targetType && row.targetId && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-card"
                                    onClick={() => onShowTimeline({ type: row.targetType!, id: row.targetId! })}
                                >
                                    Every row about this {row.targetType.toLowerCase()}
                                </Button>
                            )}

                            <section>
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Changes</h3>
                                {changes.length ? (
                                    <div className="mt-2 overflow-hidden rounded-lg border">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                                    <th className="px-3 py-2">Field</th>
                                                    <th className="px-3 py-2">Before</th>
                                                    <th className="px-3 py-2">After</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {changes.map((change) => (
                                                    <tr key={change.field} className="border-b align-top last:border-0">
                                                        <td className="px-3 py-2 font-mono text-xs text-foreground">{change.field}</td>
                                                        <td className="break-all px-3 py-2 text-muted-foreground line-through decoration-muted-foreground/50">
                                                            {cellText(change.before)}
                                                        </td>
                                                        <td className="break-all px-3 py-2 text-foreground">{cellText(change.after)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        No before/after on this row. Only the money and status models write a diff; everything else records
                                        that it happened.
                                    </p>
                                )}
                            </section>

                            <section>
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Metadata</h3>
                                {metadata.length ? (
                                    <dl className="mt-2 space-y-2 text-sm">
                                        {metadata.map(([key, value]) => (
                                            <div key={key} className="grid grid-cols-[minmax(0,140px)_1fr] gap-3">
                                                <dt className="truncate font-mono text-xs text-muted-foreground">{key}</dt>
                                                <dd className="break-all font-mono text-xs text-foreground">{cellText(value)}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">Nothing attached.</p>
                                )}
                            </section>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
