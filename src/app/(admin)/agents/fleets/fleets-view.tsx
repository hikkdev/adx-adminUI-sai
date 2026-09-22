"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { AGENT_PLATFORMS, PLATFORM_LABEL, fleetService, type AgentPlatform, type FleetPartner } from "@/services/agent-applications";

/**
 * AG-5 (the owner, 20 Sep 2026): "we will be using existing network of
 * delivery agents as our publisher agent." A fleet partner is the delivery
 * or ride fleet ops signed up; from its page a pasted list of riders is
 * invited by SMS, and every application that comes in on one of those
 * numbers carries the partner as its provenance. No partner fee.
 */

const columns: ColumnDef<FleetPartner>[] = [
    {
        accessorKey: "name",
        header: "Partner",
        cell: ({ row }) => (
            <Link href={`/agents/fleets/${row.original.id}`} className="font-medium text-foreground hover:underline">
                {row.original.name}
            </Link>
        ),
    },
    {
        accessorKey: "platform",
        header: "Fleet",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{PLATFORM_LABEL[row.original.platform as AgentPlatform] ?? row.original.platform}</span>,
    },
    { accessorKey: "city", header: "City", cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.city ?? "—"}</span> },
    {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{[row.original.contactName, row.original.phone].filter(Boolean).join(" · ") || "—"}</span>,
    },
    {
        id: "invites",
        header: "Invited · applied · activated",
        cell: ({ row }) => (
            <span className="text-xs tabular-nums text-muted-foreground" data-testid={`fleet-${row.original.id}-invites`}>
                {row.original.invites?.sent ?? 0} · {row.original.invites?.applied ?? 0} · {row.original.invites?.activated ?? 0}
            </span>
        ),
    },
    {
        accessorKey: "isActive",
        header: "State",
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? { label: "Active", tone: "success" } : { label: "Off", tone: "neutral" }} />,
    },
    { accessorKey: "createdAt", header: "Since", cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span> },
];

export function FleetsView({ partners, onChanged }: { partners: FleetPartner[]; onChanged: () => void }) {
    const router = useRouter();
    const [adding, setAdding] = React.useState(false);
    return (
        <div className="space-y-4">
            <PageHeader
                title="Fleet partners"
                subtitle="The delivery and ride fleets whose riders ADX invites to apply as field agents. Invite a pasted list from the partner's page."
                actions={
                    <Button onClick={() => setAdding(true)} data-testid="fleet-add">
                        <Plus className="size-4" aria-hidden />
                        Add a partner
                    </Button>
                }
            />
            <DataTable
                columns={columns}
                data={partners}
                showColumnToggle={false}
                onRowClick={(row) => router.push(`/agents/fleets/${row.id}`)}
                emptyState={<EmptyState icon={Truck} title="No fleet partners yet" description="Add the first — a Zomato or Rapido fleet manager, say — then paste their riders' numbers to invite them." />}
            />
            <Dialog open={adding} onOpenChange={setAdding}>
                <DialogContent className="sm:max-w-lg">
                    {adding && (
                        <PartnerForm
                            onCancel={() => setAdding(false)}
                            onCreated={(partner) => {
                                setAdding(false);
                                onChanged();
                                router.push(`/agents/fleets/${partner.id}`);
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export function PartnerForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (partner: FleetPartner) => void }) {
    const [name, setName] = React.useState("");
    const [platform, setPlatform] = React.useState<AgentPlatform>("ZOMATO");
    const [contactName, setContactName] = React.useState("");
    const [phone, setPhone] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [city, setCity] = React.useState("");
    const [notes, setNotes] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const save = async () => {
        setBusy(true);
        setError(null);
        try {
            const partner = await fleetService.create({ name: name.trim(), platform, contactName: contactName.trim() || undefined, phone: phone.trim() || undefined, email: email.trim() || undefined, city: city.trim() || undefined, notes: notes.trim() || undefined });
            toast.success(`${partner.name} added`, { description: "Paste their riders' numbers to invite them." });
            onCreated(partner);
        } catch (cause) {
            setError(cause instanceof ApiError ? cause.message : cause instanceof Error ? cause.message : "Could not add the partner.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Add a fleet partner</DialogTitle>
                <DialogDescription>The fleet or its manager. Their riders are invited from the partner&rsquo;s page afterwards.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                        <Label htmlFor="fleet-name">Name</Label>
                        <Input id="fleet-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Swift Riders, Koramangala hub" autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="fleet-platform">Fleet</Label>
                        <Select value={platform} onValueChange={(v) => setPlatform(v as AgentPlatform)}>
                            <SelectTrigger id="fleet-platform" className="bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {AGENT_PLATFORMS.map((p) => (
                                    <SelectItem key={p} value={p}>
                                        {PLATFORM_LABEL[p]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="fleet-contact">Contact name</Label>
                        <Input id="fleet-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="fleet-phone">Contact phone</Label>
                        <Input id="fleet-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="fleet-email">Email</Label>
                        <Input id="fleet-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="fleet-city">City</Label>
                        <Input id="fleet-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bengaluru" autoComplete="off" />
                    </div>
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor="fleet-notes">Notes</Label>
                    <Textarea id="fleet-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional — the arrangement, who to call." />
                </div>
                {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
                <Button type="button" onClick={() => void save()} disabled={busy || name.trim().length < 2} data-testid="fleet-add-confirm">
                    {busy ? "Adding…" : "Add partner"}
                </Button>
            </DialogFooter>
        </>
    );
}
