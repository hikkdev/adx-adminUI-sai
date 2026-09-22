"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Printer, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable, SortableHeader } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { VerifiedTick } from "@/components/adx/verified-tick";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
    SIGN_IN_STATE_META,
    lastSignInLabel,
    canActivate,
    capabilitiesLine,
    printPartnerService,
    signInState,
    type PrintPartner,
    type PrintPartnerPage,
} from "@/services/print-partners";
import { PartnerDialog } from "./partner-dialog";
import { CityCombobox } from "@/components/adx/city-combobox";
import { CITY_STAGES } from "@/services/geo";
import type { CityFacet } from "@/lib/city-facet";

export type ActiveFilter = "ACTIVE" | "INACTIVE" | "ALL";
/** Lot H: the app state, cut on the page in hand — the list route has no facet for it. */
export type SignInFilter = "ACTIVE" | "INVITED" | "APPLIED" | "ALL";

interface PrintPartnersViewProps {
    page: PrintPartnerPage;
    q: string;
    onQChange: (q: string) => void;
    /** The city facet as typed; a catalogued pick carries the city's slug beside it, and that is what the request sends. */
    city: CityFacet;
    onCityChange: (city: CityFacet) => void;
    active: ActiveFilter;
    onActiveChange: (active: ActiveFilter) => void;
    signIn: SignInFilter;
    onSignInChange: (signIn: SignInFilter) => void;
    onChanged: () => void;
}

/**
 * The roster of shops ADX pays to print.
 *
 * Search, city and the active facet are the server's — the page arrives cut
 * and counted — so the table's own search box is not drawn: two searches
 * over one list, one of which only sees a page, is how a shop goes missing.
 */
export function PrintPartnersView({
    page,
    q,
    onQChange,
    city,
    onCityChange,
    active,
    onActiveChange,
    signIn,
    onSignInChange,
    onChanged,
}: PrintPartnersViewProps) {
    const router = useRouter();
    /* Lot H: counted over the page in hand, which is the whole roster up to a hundred shops. */
    const signInCounts = React.useMemo(() => {
        const out: Record<SignInFilter, number> = { ACTIVE: 0, INVITED: 0, APPLIED: 0, ALL: page.items.length };
        for (const partner of page.items) {
            const state = signInState(partner);
            if (state === "ACTIVE" || state === "INVITED" || state === "APPLIED") out[state] += 1;
        }
        return out;
    }, [page.items]);
    const rows = React.useMemo(
        () => (signIn === "ALL" ? page.items : page.items.filter((partner) => signInState(partner) === signIn)),
        [page.items, signIn]
    );
    const [adding, setAdding] = React.useState(false);
    const [deactivating, setDeactivating] = React.useState<PrintPartner | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);

    async function deactivate() {
        if (!deactivating) return;
        setBusy(true);
        try {
            await printPartnerService.deactivate(deactivating.id, reason);
            toast.success(`${deactivating.name} is off the roster`, {
                description: "No new job may name it. Jobs already open still run and are still paid.",
            });
            setDeactivating(null);
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not deactivate the partner.");
        } finally {
            setBusy(false);
        }
    }

    const reactivate = React.useCallback(
        async (partner: PrintPartner) => {
            setBusy(true);
            try {
                await printPartnerService.reactivate(partner.id);
                toast.success(`${partner.name} is back on the roster`);
                onChanged();
            } catch (cause) {
                toast.error(cause instanceof Error ? cause.message : "Could not reactivate the partner.");
            } finally {
                setBusy(false);
            }
        },
        [onChanged]
    );

    /* Lot H: the account switched on from the row — the SMS goes out, OTP sign-in answers. */
    const activate = React.useCallback(
        async (partner: PrintPartner) => {
            setBusy(true);
            try {
                const result = await printPartnerService.activate(partner.id);
                toast.success(result.activated ? `${partner.name} can sign in` : `${partner.name} was already activated`, {
                    description: result.activated ? `An SMS told ${partner.mobile} the ADX app now takes this number.` : undefined,
                });
                onChanged();
            } catch (cause) {
                toast.error(cause instanceof Error ? cause.message : "Could not activate the account.");
            } finally {
                setBusy(false);
            }
        },
        [onChanged]
    );

    const columns = React.useMemo<ColumnDef<PrintPartner>[]>(
        () => [
            {
                id: "name",
                accessorKey: "name",
                header: ({ column }) => <SortableHeader column={column}>Shop</SortableHeader>,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium text-foreground">
                            {row.original.name}
                            <VerifiedTick kycStatus={row.original.kycStatus} />
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                            {[row.original.displayId, row.original.legalName].filter(Boolean).join(" · ") || "—"}
                        </p>
                    </div>
                ),
            },
            {
                id: "contact",
                accessorFn: (row) => `${row.contactName ?? ""} ${row.mobile}`,
                header: "Contact",
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <p className="truncate text-foreground">{row.original.contactName ?? "—"}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{row.original.mobile}</p>
                    </div>
                ),
            },
            {
                id: "city",
                accessorKey: "city",
                header: ({ column }) => <SortableHeader column={column}>City</SortableHeader>,
                cell: ({ row }) => <span className="text-muted-foreground">{row.original.city ?? "—"}</span>,
            },
            {
                id: "capabilities",
                header: "Prints",
                cell: ({ row }) => (
                    <div className="min-w-0 max-w-[16rem]">
                        <p className="truncate text-xs text-foreground" title={capabilitiesLine(row.original)}>
                            {capabilitiesLine(row.original)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {[
                                row.original.maxWidthFt ? `up to ${row.original.maxWidthFt} ft` : null,
                                row.original.turnaroundDays !== null ? `${row.original.turnaroundDays}-day turnaround` : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </p>
                    </div>
                ),
            },
            {
                id: "tax",
                header: "GSTIN / PAN",
                cell: ({ row }) => (
                    <div className="font-mono text-xs text-muted-foreground">
                        <p>{row.original.gstin ?? "—"}</p>
                        <p>{row.original.panNumber ?? "—"}</p>
                    </div>
                ),
            },
            {
                id: "since",
                accessorKey: "createdAt",
                header: ({ column }) => <SortableHeader column={column}>Since</SortableHeader>,
                cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
            },
            {
                id: "status",
                accessorFn: (row) => signInState(row),
                header: "App",
                cell: ({ row }) => {
                    const state = signInState(row.original);
                    return (
                        <div className="min-w-0">
                            <StatusBadge status={SIGN_IN_STATE_META[state]} />
                            <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                                {state === "ACTIVE" && row.original.activatedAt
                                    ? `since ${formatDate(row.original.activatedAt)}`
                                    : state === "APPLIED" && row.original.appliedAt
                                      ? `applied ${formatDate(row.original.appliedAt)} — review`
                                      : state === "INVITED"
                                        ? "account not switched on"
                                        : "sessions ended"}
                            </p>
                        </div>
                    );
                },
            },
            {
                /* G13-B: `lastLoginAt` — when the partner last signed in to the app; "never" once activated and still unseen. */
                id: "lastSignIn",
                accessorFn: (row) => row.lastLoginAt ?? "",
                header: ({ column }) => <SortableHeader column={column}>Last sign-in</SortableHeader>,
                cell: ({ row }) => (
                    <span className={cn("whitespace-nowrap text-xs", row.original.lastLoginAt ? "text-muted-foreground" : "text-muted-foreground/70")}>
                        {lastSignInLabel(row.original, formatDateTime)}
                    </span>
                ),
            },
            {
                id: "quotes",
                header: "Quotes",
                cell: ({ row }) => (
                    <div className="flex flex-wrap gap-1">
                        {row.original.rateCard.hasRateCard && <StatusBadge status={{ label: "Rate card", tone: "success" }} />}
                        {row.original.acceptsQuoteRequests && <StatusBadge status={{ label: "Takes requests", tone: "info" }} />}
                        {!row.original.rateCard.hasRateCard && !row.original.acceptsQuoteRequests && (
                            <span className="text-xs text-muted-foreground">By name only</span>
                        )}
                    </div>
                ),
            },
            {
                id: "actions",
                enableHiding: false,
                header: "",
                cell: ({ row }) => (
                    <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        {canActivate(row.original) && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void activate(row.original)}>
                                <Smartphone className="mr-1.5 size-4" />
                                Activate
                            </Button>
                        )}
                        {row.original.isActive ? (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-danger hover:text-danger"
                                disabled={busy}
                                onClick={() => {
                                    setReason("");
                                    setDeactivating(row.original);
                                }}
                            >
                                Deactivate
                            </Button>
                        ) : (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reactivate(row.original)}>
                                Reactivate
                            </Button>
                        )}
                    </div>
                ),
            },
        ],
        [activate, busy, reactivate]
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Print partners"
                subtitle="The shops ADX pays to print a booking. Ops add a partner and activate its account; the shop then signs in by OTP, keeps a rate card or takes quote requests, walks its jobs to handover, and is paid an approved cost net of TDS."
                actions={
                    <Button onClick={() => setAdding(true)}>
                        <Plus className="mr-1.5 size-4" />
                        Add partner
                    </Button>
                }
            />

            <div className="flex flex-wrap items-center gap-3">
                <FilterChips<ActiveFilter>
                    value={active}
                    onChange={onActiveChange}
                    chips={[
                        { value: "ACTIVE", label: "On the roster", count: page.counts.ACTIVE },
                        { value: "INACTIVE", label: "Off the roster", count: page.counts.INACTIVE },
                        { value: "ALL", label: "All" },
                    ]}
                />
                <FilterChips<SignInFilter>
                    value={signIn}
                    onChange={onSignInChange}
                    chips={[
                        { value: "ALL", label: "Any app state" },
                        { value: "ACTIVE", label: "Active", count: signInCounts.ACTIVE },
                        { value: "APPLIED", label: "Applications", count: signInCounts.APPLIED },
                        { value: "INVITED", label: "Invited", count: signInCounts.INVITED },
                    ]}
                />
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <Input
                        value={q}
                        onChange={(event) => onQChange(event.target.value)}
                        placeholder="Search name, PRT id, contact, mobile…"
                        aria-label="Search"
                        className="h-8 w-64"
                    />
                    <CityCombobox
                        id="print-partners-city"
                        value={city.text}
                        onChange={(text, picked) => onCityChange({ text, slug: picked?.slug ?? null })}
                        placeholder="City"
                        aria-label="City"
                        stages={CITY_STAGES}
                        className="w-44"
                    />
                </div>
            </div>

            <DataTable
                columns={columns}
                data={rows}
                initialPageSize={20}
                onRowClick={(row) => router.push(`/print-partners/${row.id}`)}
                emptyState={
                    <EmptyState
                        icon={Printer}
                        title="No print partner here"
                        description="Nobody on the roster matches this. A partner is added at the desk with its GSTIN, PAN and the address the agent collects from."
                        action={
                            <Button variant="outline" className="bg-card" onClick={() => setAdding(true)}>
                                <Plus className="mr-1.5 size-4" />
                                Add partner
                            </Button>
                        }
                    />
                }
            />

            <PartnerDialog
                open={adding}
                onOpenChange={setAdding}
                onSaved={(partner) => {
                    onChanged();
                    router.push(`/print-partners/${partner.id}`);
                }}
            />

            <ConfirmDialog
                open={deactivating !== null}
                onOpenChange={(open) => !open && setDeactivating(null)}
                title={`Take ${deactivating?.name ?? "this partner"} off the roster?`}
                description="No new job may name it. Jobs already open run to the end, their costs are still approved and still paid — a shop that printed the banners is owed for them whatever happened since. It can be put back at any time."
                confirmLabel="Deactivate"
                destructive
                busy={busy}
                onConfirm={() => void deactivate()}
            >
                <Textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Why — appended to the partner's notes. Optional."
                />
            </ConfirmDialog>
        </div>
    );
}
