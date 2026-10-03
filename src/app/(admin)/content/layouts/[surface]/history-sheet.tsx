"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { LAYOUT_VERSION_STATUS_META, layoutsService, personName, type LayoutSurface, type LayoutVersionView } from "@/services/layouts";

interface HistorySheetProps {
    surface: LayoutSurface;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mayRestore: boolean;
    /** Restoring publishes, so the builder reloads after it. */
    onRestored: () => void;
    dirty: boolean;
}

/**
 * Every version of the surface, newest first. A retired one can be
 * restored — its blocks are published again as the newest version, so the
 * history only ever grows.
 */
export function HistorySheet({ surface, open, onOpenChange, mayRestore, onRestored, dirty }: HistorySheetProps) {
    const resource = useApiResource<LayoutVersionView[]>(`layouts:versions:${surface}:${open}`, () => (open ? layoutsService.versions(surface) : Promise.resolve([])));
    const [pending, setPending] = React.useState<LayoutVersionView | null>(null);
    const [busy, setBusy] = React.useState(false);

    async function restore(version: LayoutVersionView) {
        setBusy(true);
        try {
            const restored = await layoutsService.restore(surface, version.number);
            toast.success(`Version ${version.number} is live again`, { description: `Published as version ${restored.number}.` });
            setPending(null);
            onOpenChange(false);
            onRestored();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Version history</SheetTitle>
                    <SheetDescription>Restoring publishes that version’s blocks again as the newest version. Nothing is overwritten.</SheetDescription>
                </SheetHeader>
                {dirty && mayRestore && <p className="mt-3 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">You have unsaved edits. Save or discard them before restoring a version.</p>}
                <div className="mt-4 space-y-2" data-testid="layout-history">
                    {resource.loading && resource.data === null ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
                        </p>
                    ) : resource.error ? (
                        <p className="text-sm text-danger">{resource.error}</p>
                    ) : (resource.data ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No versions yet — the screen draws its default order.</p>
                    ) : (
                        (resource.data ?? []).map((version) => (
                            <div key={version.id} className="rounded-md border p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-foreground">v{version.number}</span>
                                        <StatusBadge status={LAYOUT_VERSION_STATUS_META[version.status]} />
                                    </div>
                                    {version.status === "RETIRED" && mayRestore && (
                                        <Button size="sm" variant="outline" className="h-7 bg-card" disabled={dirty} title={dirty ? "Save or discard your edits first" : undefined} onClick={() => setPending(version)}>
                                            Restore
                                        </Button>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {version.blocks.length} {version.blocks.length === 1 ? "block" : "blocks"}
                                    {version.publishedAt ? ` · published ${formatDateTime(version.publishedAt)}` : ` · saved ${formatDateTime(version.updatedAt ?? version.createdAt)}`}
                                    {personName(version.publishedBy) ? ` by ${personName(version.publishedBy)}` : ""}
                                </p>
                                {version.changeNote && <p className="mt-1 text-sm text-foreground">{version.changeNote}</p>}
                            </div>
                        ))
                    )}
                </div>
                <ConfirmDialog
                    open={pending !== null}
                    onOpenChange={(next) => !next && !busy && setPending(null)}
                    title={`Restore version ${pending?.number ?? ""}?`}
                    description="It goes live at once as a new version; the version live now retires. Any draft waiting stays a draft."
                    confirmLabel="Restore and publish"
                    busy={busy}
                    onConfirm={() => pending && void restore(pending)}
                />
            </SheetContent>
        </Sheet>
    );
}
