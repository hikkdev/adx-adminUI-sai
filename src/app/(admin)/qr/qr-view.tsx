"use client";

import * as React from "react";
import Link from "next/link";
import { Download, MoreHorizontal, Plus, RefreshCw, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError, saveBlob } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    QR_REASON_MAX,
    QR_REASON_MIN,
    QR_TYPES,
    QR_TYPE_LABEL,
    qrImageUrl,
    qrService,
    type QrDeskRow,
    type QrPage,
    type QrType,
} from "@/services/qr";
import { GenerateQrDialog } from "./generate-qr-dialog";
import { QrNav } from "./qr-nav";
import { QrScansDrawer } from "./qr-scans-drawer";
import type { QrFacets } from "./qr-loader";

/**
 * The QR desk — `GET /qr` (K-B1).
 *
 * No DR 10 frame draws this desk; what it follows is the console's list
 * pattern. Type chips with the server's counts, an active facet, a search
 * over the id and the ref, the pager; each row is the code's preview (the
 * image route is public, so a plain `<img>`), its subject as a link where
 * the server resolved one, the scan count and last scan, the expiry, and a
 * menu — Scans, Download PNG / SVG, Regenerate (confirm), Deactivate
 * (reason). Generate mints a code for a subject found on its own roster.
 */

const ACTIVE_OPTIONS = [
    { value: "both", label: "Live and deactivated" },
    { value: "true", label: "Live only" },
    { value: "false", label: "Deactivated only" },
] as const;

interface QrViewProps {
    page: QrPage<QrDeskRow>;
    facets: QrFacets;
    onFacetsChange: (next: QrFacets) => void;
    query: string;
    onQueryChange: (value: string) => void;
    onChanged: () => void;
}

const message = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.message : fallback);

export function QrView({ page, facets, onFacetsChange, query, onQueryChange, onChanged }: QrViewProps) {
    const [generating, setGenerating] = React.useState(false);
    const [scansOf, setScansOf] = React.useState<QrDeskRow | null>(null);
    const [regenerating, setRegenerating] = React.useState<QrDeskRow | null>(null);
    const [deactivating, setDeactivating] = React.useState<QrDeskRow | null>(null);
    const [busy, setBusy] = React.useState(false);

    const everyType = Object.values(page.counts).reduce((sum, count) => sum + count, 0);
    const pages = Math.max(1, Math.ceil(page.total / page.pageSize));

    const download = async (code: QrDeskRow, kind: "png" | "svg") => {
        try {
            const file = await qrService.image(code.id, kind);
            saveBlob(file.blob, file.filename ?? `qr-${code.type.toLowerCase()}-${code.id}.${kind}`);
        } catch (caught) {
            toast.error(message(caught, "The download failed."));
        }
    };

    const regenerate = async () => {
        if (!regenerating) return;
        setBusy(true);
        try {
            const next = await qrService.regenerate(regenerating.id);
            toast.success(`New ${QR_TYPE_LABEL[next.type]} code ${next.id}`, {
                description: `${regenerating.id} is deactivated; a scan of the printed one is refused from now on.`,
            });
            setRegenerating(null);
            onChanged();
        } catch (caught) {
            toast.error(message(caught, "Could not regenerate the code."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-5">
            <QrNav />
            <PageHeader
                title="QR codes"
                subtitle="Every signed code on the platform, what it names, and who has scanned it"
                actions={
                    <Button onClick={() => setGenerating(true)}>
                        <Plus className="size-4" />
                        Generate
                    </Button>
                }
            />

            <div className="flex flex-wrap items-center gap-3">
                <Input
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder="Code id or reference id"
                    className="h-9 max-w-sm bg-card"
                    aria-label="Search codes"
                />
                <Select
                    value={facets.active === null ? "both" : String(facets.active)}
                    onValueChange={(value) => onFacetsChange({ ...facets, active: value === "both" ? null : value === "true", page: 1 })}
                >
                    <SelectTrigger className="h-9 w-52 bg-card" aria-label="Live or deactivated">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {ACTIVE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <FilterChips<QrType | "ALL">
                chips={[
                    { value: "ALL", label: "All types", count: everyType },
                    ...QR_TYPES.map((type) => ({ value: type, label: QR_TYPE_LABEL[type], count: page.counts[type] ?? 0 })),
                ]}
                value={facets.type ?? "ALL"}
                onChange={(value) => onFacetsChange({ ...facets, type: value === "ALL" ? null : value, page: 1 })}
            />

            <Card className="overflow-hidden rounded-lg border-border shadow-none">
                {page.items.length ? (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                <th className="px-4 py-2.5 font-medium">Code</th>
                                <th className="px-4 py-2.5 font-medium">Names</th>
                                <th className="px-4 py-2.5 font-medium">Scans</th>
                                <th className="px-4 py-2.5 font-medium">Last scan</th>
                                <th className="px-4 py-2.5 font-medium">Expires</th>
                                <th className="px-4 py-2.5 font-medium">Status</th>
                                <th className="px-2 py-2.5">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {page.items.map((code) => (
                                <tr key={code.id} className="border-b last:border-0 hover:bg-muted/30">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            {code.isActive ? (
                                                // eslint-disable-next-line @next/next/no-img-element -- the public image route on the API, not a static asset
                                                <img
                                                    src={qrImageUrl(code.id, "png", 120)}
                                                    alt={`QR code ${code.id}`}
                                                    width={48}
                                                    height={48}
                                                    className="size-12 shrink-0 rounded border bg-white"
                                                />
                                            ) : (
                                                <span className="flex size-12 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
                                                    <ScanLine className="size-5" />
                                                </span>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground">{QR_TYPE_LABEL[code.type] ?? code.type}</p>
                                                <p className="truncate font-mono text-xs text-muted-foreground">{code.id}</p>
                                                <p className="text-xs text-muted-foreground">Minted {formatDate(code.createdAt)}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {code.ref.href ? (
                                            <Link href={code.ref.href} className="font-medium text-foreground underline-offset-4 hover:underline">
                                                {code.ref.label ?? code.refId}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground">{code.ref.label ?? "Not found — the subject may be gone"}</span>
                                        )}
                                        <p className="font-mono text-xs text-muted-foreground">{code.ref.displayId ?? code.refId}</p>
                                    </td>
                                    <td className="px-4 py-3 tabular-nums">
                                        <button type="button" onClick={() => setScansOf(code)} className="underline-offset-4 hover:underline">
                                            {code.scansCount}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">{code.lastScanAt ? formatDateTime(code.lastScanAt) : "Never"}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{code.expiresAt ? formatDateTime(code.expiresAt) : "Open-ended"}</td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={code.isActive ? { label: "Live", tone: "success" } : { label: "Deactivated", tone: "neutral" }} />
                                    </td>
                                    <td className="px-2 py-3 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for code ${code.id}`}>
                                                    <MoreHorizontal className="size-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => setScansOf(code)}>Scans</DropdownMenuItem>
                                                {code.isActive && (
                                                    <>
                                                        <DropdownMenuItem onSelect={() => void download(code, "png")}>
                                                            <Download className="size-4" />
                                                            Download PNG
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onSelect={() => void download(code, "svg")}>
                                                            <Download className="size-4" />
                                                            Download SVG
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onSelect={() => setRegenerating(code)}>
                                                    <RefreshCw className="size-4" />
                                                    Regenerate
                                                </DropdownMenuItem>
                                                {code.isActive && (
                                                    <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setDeactivating(code)}>
                                                        Deactivate
                                                    </DropdownMenuItem>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="px-5 py-12 text-center text-sm text-muted-foreground">No codes match these filters.</p>
                )}
                <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
                    <span>
                        {page.total} {page.total === 1 ? "code" : "codes"}
                        {pages > 1 ? ` · page ${page.page} of ${pages}` : ""}
                    </span>
                    {pages > 1 && (
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-7 bg-card" disabled={facets.page <= 1} onClick={() => onFacetsChange({ ...facets, page: facets.page - 1 })}>
                                Previous
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 bg-card" disabled={facets.page >= pages} onClick={() => onFacetsChange({ ...facets, page: facets.page + 1 })}>
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            </Card>

            <GenerateQrDialog open={generating} onOpenChange={setGenerating} onGenerated={onChanged} />
            <QrScansDrawer code={scansOf} onClose={() => setScansOf(null)} />

            <ConfirmDialog
                open={regenerating !== null}
                onOpenChange={(open) => !open && setRegenerating(null)}
                title={`Regenerate ${regenerating ? QR_TYPE_LABEL[regenerating.type] : ""} code ${regenerating?.id ?? ""}?`}
                description="The printed code stops working the moment the new one exists: a scan of it is refused rather than resolved. The new code names the same subject with the same roles and expiry."
                confirmLabel="Regenerate"
                busy={busy}
                onConfirm={() => void regenerate()}
            />

            <Dialog open={deactivating !== null} onOpenChange={(open) => !open && setDeactivating(null)}>
                <DialogContent className="sm:max-w-md">
                    {deactivating && (
                        <DeactivateForm
                            code={deactivating}
                            onCancel={() => setDeactivating(null)}
                            onDone={() => {
                                setDeactivating(null);
                                onChanged();
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DeactivateForm({ code, onCancel, onDone }: { code: QrDeskRow; onCancel: () => void; onDone: () => void }) {
    const [reason, setReason] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (reason.trim().length < QR_REASON_MIN) {
            setError(`Say why — at least ${QR_REASON_MIN} characters.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await qrService.deactivate(code.id, reason);
            toast.success(`Code ${code.id} deactivated`);
            onDone();
        } catch (caught) {
            setError(message(caught, "Could not deactivate the code."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} noValidate>
            <DialogHeader>
                <DialogTitle>Deactivate code {code.id}?</DialogTitle>
                <DialogDescription>
                    A scan of it is refused from now on and its image stops rendering. Regenerate later mints a fresh code for the same subject.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                    <Label htmlFor="qr-deactivate-reason">Reason</Label>
                    <Textarea
                        id="qr-deactivate-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={2}
                        maxLength={QR_REASON_MAX}
                        placeholder="Poster replaced; the old print is still up at the site."
                        autoFocus
                    />
                    <p className="text-xs text-muted-foreground">At least {QR_REASON_MIN} characters; written on the audit row.</p>
                </div>
                {error && (
                    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                        {error}
                    </p>
                )}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel}>
                    Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={submitting}>
                    {submitting ? "Working…" : "Deactivate"}
                </Button>
            </DialogFooter>
        </form>
    );
}
