"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import {
    AUTO_INVITE_RADIUS_KM,
    DEFAULT_QUOTE_WINDOW_HOURS,
    defaultDeadline,
    printPartnerService,
    specsFromOrder,
    type PrintPartner,
} from "@/services/print-partners";
import type { Order } from "@/types";

/**
 * Lot H: raising a quote request — the specs, the deadline, and who is asked.
 *
 * This lived inside the order's Printing card, which is the only place it
 * could be reached from. The owner (24 September) looked for it in the Print
 * partners section and found nothing, so the dialog moved here and the
 * desk's Quote requests tab raises one too, picking the order first. One
 * copy, two doors: `POST /orders/:id/print-quote-request` either way.
 */

interface SpecLine {
    key: string;
    value: string;
}

/** ISO → what `<input type="datetime-local">` holds, in the browser's zone. */
function toLocalInput(iso: string): string {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RequestQuotesDialog({
    open,
    onOpenChange,
    order,
    onRaised,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    order: Order;
    onRaised: () => void;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Request quotes</DialogTitle>
                    <DialogDescription>
                        The specs go to every invited shop; each quotes a price and a turnaround, sealed from the others, until the deadline. The
                        lowest is awarded unless you name another with a note.
                    </DialogDescription>
                </DialogHeader>
                {/* Mounted with the content, so the form starts fresh — prefilled from the order — on every open. */}
                <RequestQuotesForm order={order} onClose={() => onOpenChange(false)} onRaised={onRaised} />
            </DialogContent>
        </Dialog>
    );
}

function RequestQuotesForm({ order, onClose, onRaised }: { order: Order; onClose: () => void; onRaised: () => void }) {
    /* Prefilled from the order: the spot's size and material, the artwork. */
    const [lines, setLines] = React.useState<SpecLine[]>(() => {
        const prefilled = Object.entries(specsFromOrder(order)).map(([key, value]) => ({ key, value: String(value) }));
        return prefilled.length ? prefilled : [{ key: "size", value: "" }];
    });
    const [notes, setNotes] = React.useState("");
    /* The clock the deadline is checked against — when the form opened; the backend checks again on submit. */
    const [openedAt] = React.useState(() => Date.now());
    const [deadline, setDeadline] = React.useState(() => toLocalInput(defaultDeadline(new Date(openedAt))));
    const [mode, setMode] = React.useState<"AUTO" | "PICK">("AUTO");
    const [picked, setPicked] = React.useState<string[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [reachHint, setReachHint] = React.useState<string | null>(null);

    const partners = useApiResource<PrintPartner[]>("print-partners:active", async () => {
        const page = await printPartnerService.list({
            active: true,
            pageSize: 100,
        });
        return page.items;
    });

    const specs = React.useMemo(() => {
        const out: Record<string, string> = {};
        for (const line of lines) {
            const key = line.key.trim();
            const value = line.value.trim();
            if (key && value) out[key] = value;
        }
        if (notes.trim()) out.notes = notes.trim();
        return out;
    }, [lines, notes]);

    const deadlineIso = deadline ? new Date(deadline).toISOString() : undefined;
    const deadlineOk = !deadline || new Date(deadline).getTime() > openedAt;
    const valid = Object.keys(specs).length > 0 && deadlineOk && (mode === "AUTO" || picked.length > 0);

    async function raise() {
        setBusy(true);
        try {
            const created = await printPartnerService.requestQuotes(order.id, {
                specs,
                ...(deadlineIso ? { deadlineAt: deadlineIso } : {}),
                invite: mode === "AUTO" ? "AUTO" : picked,
            });
            toast.success(`${created.invited.length} partner${created.invited.length === 1 ? "" : "s"} asked to quote`, {
                description: `${created.invited.map((partner) => partner.name).join(", ")} — until ${formatDateTime(created.deadlineAt)}.`,
            });
            onClose();
            onRaised();
        } catch (cause) {
            if (cause instanceof ApiError && cause.code === "NO_PARTNERS_IN_REACH") {
                setReachHint(cause.message);
                setMode("PICK");
            } else {
                toast.error(cause instanceof Error ? cause.message : "The request did not reach ADX.");
            }
        } finally {
            setBusy(false);
        }
    }

    const roster = partners.data ?? [];

    return (
        <>
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label>Specs</Label>
                    <div className="space-y-2">
                        {lines.map((line, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={line.key}
                                    onChange={(event) =>
                                        setLines((prev) => prev.map((row, i) => (i === index ? { ...row, key: event.target.value } : row)))
                                    }
                                    placeholder="size"
                                    className="w-32"
                                    aria-label={`Spec ${index + 1} name`}
                                />
                                <Input
                                    value={line.value}
                                    onChange={(event) =>
                                        setLines((prev) => prev.map((row, i) => (i === index ? { ...row, value: event.target.value } : row)))
                                    }
                                    placeholder="10 x 20 ft"
                                    aria-label={`Spec ${index + 1} value`}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                                    disabled={lines.length === 1}
                                    aria-label="Remove spec"
                                >
                                    ×
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="bg-card"
                        onClick={() => setLines((prev) => [...prev, { key: "", value: "" }])}
                    >
                        Add a line
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        Prefilled from the spot — its size, category and placement — and the artwork the advertiser attached. Add the material,
                        quantity, finish.
                    </p>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="quote-notes">Notes to the shops</Label>
                    <Textarea
                        id="quote-notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Optional."
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="quote-deadline">Quotes close</Label>
                    <Input
                        id="quote-deadline"
                        type="datetime-local"
                        value={deadline}
                        onChange={(event) => setDeadline(event.target.value)}
                        aria-invalid={!deadlineOk || undefined}
                    />
                    <p className="text-xs text-muted-foreground">
                        {deadlineOk
                            ? `${DEFAULT_QUOTE_WINDOW_HOURS} hours by default. A request nobody answers is re-invited once, then expires.`
                            : "The deadline has to be in the future."}
                    </p>
                </div>
                <div className="space-y-2">
                    <Label>Who is asked</Label>
                    <RadioGroup value={mode} onValueChange={(value) => setMode(value as "AUTO" | "PICK")} className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="AUTO" id="invite-auto" />
                            Everyone in reach
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                            <RadioGroupItem value="PICK" id="invite-pick" />
                            Partners I pick
                        </label>
                    </RadioGroup>
                    {reachHint && <p className="text-xs text-danger">{reachHint}</p>}
                    {mode === "AUTO" ? (
                        <p className="text-xs text-muted-foreground">
                            Active shops taking requests in {order.city ?? "the order's city"} or within {AUTO_INVITE_RADIUS_KM} km of the site,
                            rate-card partners first.
                        </p>
                    ) : (
                        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                            {partners.loading && roster.length === 0 ? (
                                <p className="p-2 text-xs text-muted-foreground">Loading the roster…</p>
                            ) : roster.length === 0 ? (
                                <p className="p-2 text-xs text-muted-foreground">Nobody is on the roster.</p>
                            ) : (
                                roster.map((partner) => {
                                    const checked = picked.includes(partner.id);
                                    return (
                                        <label
                                            key={partner.id}
                                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                                        >
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={(state) =>
                                                    setPicked((prev) =>
                                                        state === true ? [...prev, partner.id] : prev.filter((id) => id !== partner.id),
                                                    )
                                                }
                                            />
                                            <span className="min-w-0 flex-1 truncate">
                                                {partner.name}
                                                {partner.city ? <span className="text-muted-foreground"> · {partner.city}</span> : null}
                                            </span>
                                            {partner.rateCard.hasRateCard && <StatusBadge status={{ label: "Rate card", tone: "success" }} />}
                                            {!partner.acceptsQuoteRequests && <StatusBadge status={{ label: "No requests", tone: "neutral" }} />}
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button onClick={() => void raise()} disabled={busy || !valid}>
                    {busy ? "Sending…" : "Send the request"}
                </Button>
            </DialogFooter>
        </>
    );
}
