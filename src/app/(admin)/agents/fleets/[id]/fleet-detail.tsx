"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DetailShell } from "@/components/adx/detail-shell";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import {
    FLEET_INVITE_META,
    PLATFORM_LABEL,
    STAGE_META,
    fleetService,
    parseInviteRows,
    type AgentPlatform,
    type AgentStage,
    type FleetInvite,
    type FleetInviteResult,
    type FleetPartner,
} from "@/services/agent-applications";

interface FleetDetailProps {
    partner: FleetPartner;
    invites: FleetInvite[];
    onChanged: () => void;
}

/**
 * One fleet partner: the invites so far with where each rider stands —
 * invited, applied, activated — and the paste box that invites more. A
 * number already on the list is skipped; a row that is not a number comes
 * back so the paste can be fixed.
 */
export function FleetDetail({ partner, invites, onChanged }: FleetDetailProps) {
    const [text, setText] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [last, setLast] = React.useState<FleetInviteResult | null>(null);
    const rows = React.useMemo(() => parseInviteRows(text), [text]);

    const invite = async () => {
        setBusy(true);
        try {
            const result = await fleetService.invite(partner.id, rows);
            setLast(result);
            setText("");
            toast.success(`${result.invited} rider${result.invited === 1 ? "" : "s"} invited`, {
                description: `${result.sent} texted${result.duplicates ? ` · ${result.duplicates} already on the list` : ""}${result.rejected.length ? ` · ${result.rejected.length} not a number` : ""}`,
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The invites did not go out.");
        } finally {
            setBusy(false);
        }
    };

    const toggle = async () => {
        try {
            await fleetService.update(partner.id, { isActive: !partner.isActive });
            toast.success(partner.isActive ? `${partner.name} switched off` : `${partner.name} switched on`);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not change the partner.");
        }
    };

    return (
        <DetailShell
            backHref="/agents/fleets"
            backLabel="Fleet partners"
            title={partner.name}
            subtitle={[PLATFORM_LABEL[partner.platform as AgentPlatform] ?? partner.platform, partner.city].filter(Boolean).join(" · ")}
            actions={
                <Button variant="outline" className="bg-card" onClick={() => void toggle()} data-testid="fleet-toggle">
                    {partner.isActive ? "Switch off" : "Switch on"}
                </Button>
            }
            kpis={[
                { id: "invited", label: "Invited", value: String(partner.invites?.sent ?? 0) },
                { id: "applied", label: "Applied", value: String(partner.invites?.applied ?? 0), hint: "Applied with an invited number" },
                { id: "activated", label: "Activated", value: String(partner.invites?.activated ?? 0), hint: "Now ADX field agents" },
                { id: "state", label: "State", value: partner.isActive ? "Active" : "Off", hint: partner.isActive ? "Takes invites" : "No invites while off" },
            ]}
            tabs={[
                {
                    value: "invites",
                    label: "Riders",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Invited riders</h3>
                                <SimpleTable
                                    className="mt-4"
                                    rows={invites}
                                    rowKey={(row) => row.id}
                                    emptyMessage="Nobody invited yet — paste the partner's list on the right."
                                    columns={[
                                        { key: "mobile", label: "Number", render: (row) => <span className="font-mono text-xs">{row.mobile}</span> },
                                        { key: "name", label: "Name", render: (row) => row.agent?.user.name ?? row.name ?? "—" },
                                        { key: "status", label: "Standing", render: (row) => <StatusBadge status={FLEET_INVITE_META[row.status]} /> },
                                        {
                                            key: "agent",
                                            label: "Application",
                                            render: (row) =>
                                                row.agent ? (
                                                    <Link href={`/agents/applications/${row.agent.id}`} className="text-xs hover:underline">
                                                        {row.agent.displayId ?? "Open"} · {STAGE_META[row.agent.stage as AgentStage]?.label ?? row.agent.stage}
                                                    </Link>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                ),
                                        },
                                        { key: "sent", label: "Invited", render: (row) => <span className="text-xs text-muted-foreground">{formatDateTime(row.sentAt)}</span> },
                                    ]}
                                />
                            </Card>
                            <Card className="rounded-lg border-border p-5 shadow-none" data-testid="fleet-invite-card">
                                <h3 className="text-base font-semibold text-foreground">Invite riders</h3>
                                <p className="mt-1 text-sm text-muted-foreground">One rider per line — the number, and a name after a comma if the partner gave one. Each fresh number gets an SMS with the app link.</p>
                                <div className="mt-3 grid gap-1.5">
                                    <Label htmlFor="fleet-paste">Numbers</Label>
                                    <Textarea id="fleet-paste" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"9000000001, Ravi\n9000000002"} disabled={!partner.isActive} data-testid="fleet-paste" />
                                    <p className="text-xs text-muted-foreground">{rows.length} row{rows.length === 1 ? "" : "s"} to invite</p>
                                </div>
                                <Button className="mt-3" onClick={() => void invite()} disabled={busy || rows.length === 0 || !partner.isActive} data-testid="fleet-invite">
                                    {busy ? "Inviting…" : `Invite ${rows.length || ""}`.trim()}
                                </Button>
                                {last && last.rejected.length > 0 && (
                                    <div className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger" data-testid="fleet-rejected">
                                        Not a number: {last.rejected.map((r) => r.mobile).join(", ")}
                                    </div>
                                )}
                            </Card>
                        </div>
                    ),
                },
                {
                    value: "partner",
                    label: "Partner",
                    content: (
                        <Card className="rounded-lg border-border p-5 shadow-none lg:max-w-xl">
                            <h3 className="text-base font-semibold text-foreground">The partner</h3>
                            <FieldList
                                className="mt-4"
                                items={[
                                    ["Fleet", PLATFORM_LABEL[partner.platform as AgentPlatform] ?? partner.platform],
                                    ["Contact", partner.contactName ?? "—"],
                                    ["Phone", partner.phone ?? "—"],
                                    ["Email", partner.email ?? "—"],
                                    ["City", partner.city ?? "—"],
                                    ["Notes", partner.notes ?? "—"],
                                    ["Since", formatDateTime(partner.createdAt)],
                                ]}
                            />
                        </Card>
                    ),
                },
            ]}
        />
    );
}
