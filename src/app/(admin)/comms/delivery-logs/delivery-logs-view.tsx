"use client";

import * as React from "react";
import { Check, Download, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useApiResource } from "@/lib/use-api-resource";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { formatNumber } from "@/lib/format";
import {
    CHANNEL_LABEL,
    DELIVERY_STATUSES,
    DELIVERY_STATUS_META,
    canResend,
    channelCount,
    commsService,
    etherealPreviewUrl,
    resendBlocker,
    type CommsTemplate,
    type DeliveriesPage,
    type DeliveriesQuery,
    type Delivery,
    type DeliveryAttempt,
    type DeliveryDetail,
    type DeliveryStatus,
    type NotificationChannel,
} from "@/services/comms";
import type { DeliveryFilters } from "./delivery-logs-loader";

interface DeliveryLogsViewProps {
    page: DeliveriesPage;
    templates: Record<string, CommsTemplate>;
    filters: DeliveryFilters;
    /** The filters as the server took them — what Export files. */
    query: DeliveriesQuery;
    onFiltersChange: (next: DeliveryFilters) => void;
    onChanged: () => void;
}

/** The chips the frame draws, in the order it draws them. The contract also cuts by IN_APP, which the dispatcher never writes. */
const CHANNEL_CHIPS: NotificationChannel[] = ["EMAIL", "SMS", "PUSH"];

/**
 * Delivery logs — the DR 10 frame over `GET /comms/deliveries`.
 *
 * The table is the frame's: timestamp, channel, template, the masked
 * recipient, status with the error under it, attempts. The detail card is
 * the row's own fields — the provider and its message id, the last error,
 * the variables as the server masks them — and, since Lot G (package CG4,
 * Q121), the frame's per-attempt trail: `GET /comms/deliveries/:id`
 * carries `attemptRows`, one per try with the provider, its raw answer
 * (masked) and the error, oldest first, read when a row is selected.
 * Resend is drawn only where the server would take it. E10-2: the channel chips carry the
 * page's `byChannel` — counted with the channel facet removed, so every
 * chip's number is what choosing it would show — and Export downloads
 * `GET /comms/deliveries/export.csv` under the filters in force.
 */
export function DeliveryLogsView({ page, templates, filters, query, onFiltersChange, onChanged }: DeliveryLogsViewProps) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [resending, setResending] = React.useState(false);
    const [exporting, setExporting] = React.useState(false);

    const exportCsv = async () => {
        setExporting(true);
        try {
            const { filename, bytes } = await commsService.exportDeliveries(query);
            toast.success(`Saved ${filename}`, {
                description: `${formatNumber(Math.round(bytes / 1024))} KB · masked recipients only, 50,000 rows at most. The audit trail records the export.`,
            });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The export failed.");
        } finally {
            setExporting(false);
        }
    };

    /** Every chip's count from `byChannel`; "All" is the page total under every other filter. */
    const allCount = CHANNEL_CHIPS.reduce((sum, channel) => sum + channelCount(page, channel), channelCount(page, "IN_APP"));

    const rows = page.items;
    const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
    const set = (patch: Partial<DeliveryFilters>) => onFiltersChange({ ...filters, ...patch });
    const templateKeys = Object.keys(templates).sort();

    const resend = async (row: Delivery) => {
        setResending(true);
        try {
            const fresh = await commsService.resend(row.id);
            toast.success("Message queued again", {
                description: `A new ${CHANNEL_LABEL[fresh.channel].toLowerCase()} row for ${fresh.recipientMasked}, attempted now.`,
            });
            onChanged();
        } catch (error) {
            // The server's own reasons — a sensitive template, purged
            // variables, an address no longer available — shown as it said them.
            toast.error(error instanceof Error ? error.message : "The resend was refused.");
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="space-y-5">
            <PageHeader
                title="Delivery logs"
                subtitle={`Every email and SMS that left the dispatcher · ${page.total} row${page.total === 1 ? "" : "s"} match`}
                actions={
                    <Button variant="outline" className="bg-card" disabled={exporting || page.total === 0} onClick={() => void exportCsv()}>
                        <Download className="size-4" />
                        {exporting ? "Exporting…" : "Export CSV"}
                    </Button>
                }
            />

            <div className="flex flex-wrap items-end gap-3">
                <FilterChips<NotificationChannel | "ALL">
                    value={filters.channel}
                    onChange={(channel) => set({ channel })}
                    chips={[
                        { value: "ALL", label: "All", count: allCount },
                        ...CHANNEL_CHIPS.map((channel) => ({ value: channel, label: CHANNEL_LABEL[channel], count: channelCount(page, channel) })),
                    ]}
                />
                <div className="relative min-w-56 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                        value={filters.q}
                        onChange={(event) => set({ q: event.target.value })}
                        placeholder="Address, hash, or part of the mask"
                        aria-label="Search deliveries"
                        className="pl-8"
                    />
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                    <Label htmlFor="dl-status" className="text-xs">
                        Status
                    </Label>
                    <Select value={filters.status} onValueChange={(status) => set({ status: status as DeliveryStatus | "ALL" })}>
                        <SelectTrigger id="dl-status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All statuses</SelectItem>
                            {DELIVERY_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                    {DELIVERY_STATUS_META[status].label} · {page.counts[status] ?? 0}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="dl-template" className="text-xs">
                        Template
                    </Label>
                    <Select value={filters.templateKey} onValueChange={(templateKey) => set({ templateKey })}>
                        <SelectTrigger id="dl-template">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All templates</SelectItem>
                            {templateKeys.map((key) => (
                                <SelectItem key={key} value={key}>
                                    {key}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label htmlFor="dl-from" className="text-xs">
                        From
                    </Label>
                    <Input id="dl-from" type="datetime-local" value={filters.from} onChange={(event) => set({ from: event.target.value })} />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="dl-to" className="text-xs">
                        To
                    </Label>
                    <Input id="dl-to" type="datetime-local" value={filters.to} onChange={(event) => set({ to: event.target.value })} />
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                                    <th className="px-5 py-2.5">Timestamp</th>
                                    <th className="px-4 py-2.5">Channel</th>
                                    <th className="px-4 py-2.5">Template</th>
                                    <th className="px-4 py-2.5">Recipient</th>
                                    <th className="px-4 py-2.5">Status</th>
                                    <th className="px-4 py-2.5 text-right">Attempts</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        onClick={() => setSelectedId(row.id)}
                                        className={cn(
                                            "cursor-pointer border-b transition-colors last:border-0",
                                            selected?.id === row.id ? "bg-primary/[0.04]" : "hover:bg-muted/40",
                                        )}
                                    >
                                        <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">{formatDateTime(row.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{CHANNEL_LABEL[row.channel]}</code>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-foreground">{row.templateKey ?? "—"}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.recipientMasked}</td>
                                        <td className="px-4 py-3">
                                            <div>
                                                <StatusBadge status={DELIVERY_STATUS_META[row.status]} />
                                                {row.lastError && <p className="mt-0.5 max-w-56 truncate text-xs text-danger">{row.lastError}</p>}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-right tabular-nums">{row.attempts}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                                            No deliveries match. Rows are kept for 180 days; the search hashes an exact address the way the server does.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>

                {selected && (
                    <DetailCard
                        key={selected.id}
                        delivery={selected}
                        template={selected.templateKey ? templates[selected.templateKey] : undefined}
                        busy={resending}
                        onResend={() => resend(selected)}
                    />
                )}
            </div>
        </div>
    );
}

function DetailCard({
    delivery,
    template,
    busy,
    onResend,
}: {
    delivery: Delivery;
    template: CommsTemplate | undefined;
    busy: boolean;
    onResend: () => void;
}) {
    const allowed = canResend(delivery, template);
    const blocker = resendBlocker(delivery, template);
    const variables = delivery.variables ? Object.entries(delivery.variables) : [];
    /* Q121: the attempt trail lives on the single read only; keyed on the
       row's attempt count so a resend's re-read fetches the new tries. */
    const detail = useApiResource<DeliveryDetail>(`comms:delivery:${delivery.id}:${delivery.attempts}:${delivery.status}`, () =>
        commsService.delivery(delivery.id),
    );

    return (
        <Card className="h-fit rounded-lg border-border p-5 shadow-none">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Message detail</h3>
            <p className="mt-2 text-sm font-semibold text-foreground">{delivery.templateKey ?? "No template"}</p>
            <p className="font-mono text-xs text-muted-foreground">
                {CHANNEL_LABEL[delivery.channel]} · {delivery.recipientMasked}
            </p>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                    <StatusBadge status={DELIVERY_STATUS_META[delivery.status]} />
                </dd>
                <dt className="text-muted-foreground">Attempts</dt>
                <dd className="tabular-nums text-foreground">{delivery.attempts} of 3</dd>
                <dt className="text-muted-foreground">Queued</dt>
                <dd className="text-foreground">{formatDateTime(delivery.createdAt)}</dd>
                {delivery.sentAt && (
                    <>
                        <dt className="text-muted-foreground">Sent</dt>
                        <dd className="text-foreground">{formatDateTime(delivery.sentAt)}</dd>
                    </>
                )}
                {delivery.deliveredAt && (
                    <>
                        <dt className="text-muted-foreground">Delivered</dt>
                        <dd className="text-foreground">{formatDateTime(delivery.deliveredAt)}</dd>
                    </>
                )}
                {template && (
                    <>
                        <dt className="text-muted-foreground">Template</dt>
                        <dd className="text-foreground">
                            v{template.version}
                            {template.isSensitive ? " · sensitive" : ""}
                        </dd>
                    </>
                )}
            </dl>

            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Provider</h4>
            <code className="mt-2 block break-all rounded-md bg-muted px-3 py-2 text-xs">
                {delivery.provider ? `${delivery.provider}: ${delivery.providerMessageId ?? "no message id yet"}` : "Not handed to a provider yet"}
            </code>

            {delivery.lastError && (
                <>
                    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Last error</h4>
                    <p className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{delivery.lastError}</p>
                </>
            )}

            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attempts</h4>
            {detail.data ? (
                <AttemptTrail attempts={detail.data.attemptRows ?? []} />
            ) : detail.error ? (
                <p className="mt-2 text-xs text-danger">{detail.error}</p>
            ) : (
                <p className="mt-2 text-xs text-muted-foreground">Reading the trail…</p>
            )}

            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variables</h4>
            {variables.length ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {variables.map(([name, value]) => (
                        <React.Fragment key={name}>
                            <dt className="font-mono text-muted-foreground">{name}</dt>
                            <dd className="break-all text-foreground">{typeof value === "string" ? value : JSON.stringify(value)}</dd>
                        </React.Fragment>
                    ))}
                </dl>
            ) : (
                <p className="mt-2 text-xs text-muted-foreground">{delivery.purgedAt ? `Purged ${formatDateTime(delivery.purgedAt)}.` : "None recorded."}</p>
            )}

            {allowed ? (
                <Button variant="outline" size="sm" className="mt-4 h-8 w-full bg-card" disabled={busy} onClick={onResend}>
                    Resend message
                </Button>
            ) : (
                blocker && <p className="mt-4 text-xs text-muted-foreground">{blocker}</p>
            )}
        </Card>
    );
}

/**
 * AE-C: the rail's answer as text - except the Ethereal preview inside it,
 * which is printed as a link so the message the test inbox caught (and
 * nothing delivered) can be read.
 */
function ResponseLine({ text }: { text: string }) {
    const preview = etherealPreviewUrl(text);
    const at = preview ? text.indexOf(preview) : -1;
    return (
        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground" title="The rail's answer, addresses masked">
            {preview && at >= 0 ? (
                <>
                    {text.slice(0, at)}
                    <a href={preview} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                        {preview}
                    </a>
                    {text.slice(at + preview.length)}
                </>
            ) : (
                text
            )}
        </p>
    );
}

/**
 * Q121: one line per try, oldest first — the provider that took it, what it
 * answered (any address inside masked by the server), the error when it
 * failed, and when. A try that never reached a rail has no provider and
 * says why in its error.
 */
function AttemptTrail({ attempts }: { attempts: DeliveryAttempt[] }) {
    if (attempts.length === 0) {
        return <p className="mt-2 text-xs text-muted-foreground">No try recorded yet — the row is queued, or was skipped before a rail was asked.</p>;
    }
    return (
        <ol className="mt-2 space-y-2">
            {attempts.map((attempt) => (
                <li key={attempt.attempt} className="rounded-md border px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                            {attempt.ok ? <Check className="size-3 text-success" aria-label="Accepted" /> : <X className="size-3 text-danger" aria-label="Failed" />}
                            Attempt {attempt.attempt}
                            {attempt.provider && <span className="font-normal text-muted-foreground">· {attempt.provider}</span>}
                        </span>
                        <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(attempt.at)}</span>
                    </div>
                    {attempt.providerMessageId && (
                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{attempt.providerMessageId}</p>
                    )}
                    {attempt.responseText && <ResponseLine text={attempt.responseText} />}
                    {attempt.error && <p className="mt-1 break-all text-danger">{attempt.error}</p>}
                </li>
            ))}
        </ol>
    );
}
