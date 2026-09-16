"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FilterChips } from "@/components/adx/filter-chips";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { QR_TYPE_LABEL, qrService, scanOutcomeMeta, type QrDeskRow, type QrPage, type QrScanRow } from "@/services/qr";

const PAGE_SIZE = 25;

interface QrScansDrawerProps {
    code: QrDeskRow | null;
    onClose: () => void;
}

/**
 * One code's scans — `GET /qr/:qrId/scans` (K-B1), the list contract with
 * counts per outcome, so every chip says how many it would show. Every
 * attempt is a row, refusals included; who scanned links to the person.
 */
export function QrScansDrawer({ code, onClose }: QrScansDrawerProps) {
    return (
        <Sheet open={code !== null} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
                {code && <DrawerBody code={code} />}
            </SheetContent>
        </Sheet>
    );
}

function DrawerBody({ code }: { code: QrDeskRow }) {
    const [outcome, setOutcome] = React.useState<string>("ALL");
    const [page, setPage] = React.useState(1);

    const resource = useApiResource<QrPage<QrScanRow>>(`qr:scans:${code.id}:${outcome}:${page}`, () =>
        qrService.scans(code.id, { ...(outcome === "ALL" ? {} : { outcome }), page, pageSize: PAGE_SIZE }),
    );

    return (
        <>
            <SheetHeader className="border-b px-5 py-4 text-left">
                <SheetTitle>Scans of {QR_TYPE_LABEL[code.type]} code</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                    {code.id} · {code.ref.label ?? code.refId}
                </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4">
                <ResourceBoundary resource={resource}>
                    {(data) => {
                        const total = Object.values(data.counts).reduce((sum, count) => sum + count, 0);
                        const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
                        return (
                            <div className="space-y-4">
                                <FilterChips
                                    chips={[
                                        { value: "ALL", label: "All", count: total },
                                        ...Object.entries(data.counts)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([value, count]) => ({ value, label: scanOutcomeMeta(value).label, count })),
                                    ]}
                                    value={outcome}
                                    onChange={(value) => {
                                        setOutcome(value);
                                        setPage(1);
                                    }}
                                />
                                {data.items.length === 0 ? (
                                    <p className="py-8 text-center text-sm text-muted-foreground">No scans{outcome === "ALL" ? " yet" : " with this outcome"}.</p>
                                ) : (
                                    <ul className="divide-y rounded-md border">
                                        {data.items.map((scan) => (
                                            <li key={scan.id} className="flex items-center gap-3 px-3 py-2.5">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-foreground">
                                                        <Link href={`/users/${encodeURIComponent(scan.scannedBy.id)}`} className="underline-offset-4 hover:underline">
                                                            {scan.scannedBy.name}
                                                        </Link>
                                                        {scan.role && <span className="ml-2 text-xs text-muted-foreground">as {scan.role.replace(/_/g, " ").toLowerCase()}</span>}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {[
                                                            formatDateTime(scan.createdAt),
                                                            scan.action,
                                                            scan.distanceM !== null ? `${Math.round(scan.distanceM)} m away` : null,
                                                            scan.decidedAt ? `decided ${formatDateTime(scan.decidedAt)}` : null,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ")}
                                                    </p>
                                                </div>
                                                <StatusBadge status={scanOutcomeMeta(scan.outcome)} />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {pages > 1 && (
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>
                                            Page {data.page} of {pages} · {data.total} scans
                                        </span>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" className="h-8 bg-card" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                                                Previous
                                            </Button>
                                            <Button variant="outline" size="sm" className="h-8 bg-card" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    }}
                </ResourceBoundary>
            </div>
        </>
    );
}
