"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";

type NodeKind = "flagged" | "shared" | "clean";

interface GraphNode {
    id: string;
    label: string;
    sub: string;
    kind: NodeKind;
    x: number;
    y: number;
}

const nodes: GraphNode[] = [
    { id: "fa", label: "FA", sub: "FakeAds Ltd", kind: "flagged", x: 22, y: 20 },
    { id: "nr", label: "NR", sub: "Nova Reach", kind: "flagged", x: 20, y: 62 },
    { id: "pa", label: "PA", sub: "Prime Ads", kind: "flagged", x: 40, y: 84 },
    { id: "sc", label: "SC", sub: "Skyline Co", kind: "flagged", x: 44, y: 12 },
    { id: "dev", label: "▢", sub: "Device 4f2a · 6 sessions", kind: "shared", x: 38, y: 42 },
    { id: "pan", label: "ID", sub: "PAN ••••1234 · shared by 4", kind: "shared", x: 58, y: 30 },
    { id: "bank", label: "₹", sub: "HDFC ••4821 · shared by 4", kind: "shared", x: 58, y: 62 },
    { id: "zp", label: "ZP", sub: "Zepto · no link", kind: "clean", x: 84, y: 22 },
    { id: "bl", label: "BL", sub: "Blinkit · no link", kind: "clean", x: 86, y: 70 },
];

const edges: [string, string][] = [
    ["fa", "dev"], ["nr", "dev"], ["pa", "dev"], ["sc", "dev"],
    ["fa", "pan"], ["sc", "pan"], ["nr", "bank"], ["pa", "bank"],
    ["pan", "bank"],
];

const nodeClasses: Record<NodeKind, string> = {
    flagged: "border-danger bg-danger-soft text-danger",
    shared: "border-warning bg-warning-soft text-warning",
    clean: "border-border bg-card text-muted-foreground",
};

const sharedSignals = [
    ["PAN number", "4 accounts"],
    ["Device fingerprint", "4 accounts"],
    ["Payout account", "4 accounts"],
    ["IP subnet", "3 accounts"],
] as [string, string][];

const timeline = [
    { label: "Auto-suspended by fraud engine", ago: "1h ago" },
    { label: "4th account created on same device", ago: "2h ago" },
    { label: "Payout account reused", ago: "1d ago" },
    { label: "First account created", ago: "12d ago" },
];

export function FraudView() {
    const [note, setNote] = React.useState("");

    const findNode = (id: string) => nodes.find((node) => node.id === id)!;

    return (
        <div className="space-y-5">
            <SubNav
                items={[
                    { label: "Disputes", href: "/disputes", exact: true },
                    { label: "Fraud investigation", href: "/disputes/fraud" },
                ]}
            />

            <PageHeader
                title="Fraud investigation"
                subtitle="Case #FR-1184"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Case dismissed and accounts restored")}
                        >
                            Dismiss case
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                toast.success("4 accounts suspended", {
                                    description: "Payouts frozen and sessions revoked.",
                                })
                            }
                        >
                            Suspend 4 accounts
                        </Button>
                    </>
                }
            />

            <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3">
                <TriangleAlert className="size-4 shrink-0 text-danger" />
                <p className="text-sm text-foreground">
                    <span className="font-semibold text-danger">Fraud score 0.91.</span> 4 accounts
                    share a PAN, a device fingerprint and a payout account.
                </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                {/* Link graph */}
                <Card className="relative min-h-[460px] overflow-hidden rounded-lg border-border shadow-none xl:col-span-2">
                    <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full border border-danger bg-danger-soft" />
                            Flagged
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full border border-warning bg-warning-soft" />
                            Shared attribute
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full border bg-card" />
                            Clean
                        </span>
                    </div>

                    <svg className="absolute inset-0 size-full" aria-hidden>
                        {edges.map(([fromId, toId]) => {
                            const from = findNode(fromId);
                            const to = findNode(toId);
                            return (
                                <line
                                    key={`${fromId}-${toId}`}
                                    x1={`${from.x}%`}
                                    y1={`${from.y}%`}
                                    x2={`${to.x}%`}
                                    y2={`${to.y}%`}
                                    stroke="hsl(240 5.9% 84%)"
                                    strokeWidth="1.5"
                                />
                            );
                        })}
                    </svg>

                    {nodes.map((node) => (
                        <div
                            key={node.id}
                            className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                            style={{ left: `${node.x}%`, top: `${node.y}%` }}
                        >
                            <button
                                type="button"
                                onClick={() => toast.info(node.sub)}
                                className={cn(
                                    "mx-auto flex size-11 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm transition-transform hover:scale-105",
                                    nodeClasses[node.kind]
                                )}
                            >
                                {node.label}
                            </button>
                            <p className="mt-1 w-32 -translate-x-[calc(50%-22px)] text-[10px] leading-tight text-muted-foreground">
                                {node.sub}
                            </p>
                        </div>
                    ))}
                </Card>

                {/* Rail */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Shared signals
                        </h3>
                        <dl className="mt-3 space-y-2.5 text-sm">
                            {sharedSignals.map(([label, value]) => (
                                <div key={label} className="flex items-center justify-between gap-4">
                                    <dt className="text-foreground">{label}</dt>
                                    <dd className="font-medium text-danger">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Timeline
                        </h3>
                        <ul className="mt-3 space-y-3">
                            {timeline.map((event) => (
                                <li key={event.label} className="flex items-start gap-2.5 text-sm">
                                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                                    <div className="flex-1">
                                        <p className="text-foreground">{event.label}</p>
                                        <p className="text-xs text-muted-foreground">{event.ago}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Case notes
                        </h3>
                        <Textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            placeholder="Add investigation note"
                            className="mt-3 min-h-20 resize-none"
                        />
                        <div className="mt-3 flex items-center justify-between gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 bg-card"
                                onClick={() => {
                                    if (!note.trim()) return;
                                    toast.success("Note saved to the case file");
                                    setNote("");
                                }}
                            >
                                Save note
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-danger hover:text-danger"
                                onClick={() => toast.success("Case escalated to legal")}
                            >
                                Escalate to legal
                            </Button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
