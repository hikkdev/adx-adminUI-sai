"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { FieldList } from "@/components/adx/simple-table";
import { FilterChips } from "@/components/adx/filter-chips";
import { KpiCard } from "@/components/adx/kpi-card";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ActiveFilters, FilterPanel, type Facet, type FilterSelection } from "@/components/adx/filter-panel";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ADVERTISER_DESK_FACTS, advertiserDeskTiles, advertiserKycService } from "@/services/advertiser-kyc";
import { escalationChip, personLabel, recordedLine, REQUEST_CHANNEL_LABEL, requestLine } from "@/services/kyc";
import { KYC_STATE_META, kycHeadline, kycStateChips, type KycStateChip } from "@/services/kyc-state";
import { formatDate } from "@/lib/format";
import { ADVERTISER_KYC_TYPE_META, type AdvertiserKycCase } from "@/types";
import { KycRowActions } from "../_shared/kyc-row-actions";
import { RecordAtDeskDialog } from "../_shared/record-at-desk-dialog";
import { AdvertiserCaseDesk } from "./advertiser-case-desk";
import type { LoadedAdvertiserQueue } from "./advertiser-kyc-loader";

interface AdvertiserKycViewProps {
    loaded: LoadedAdvertiserQueue;
    chip: KycStateChip;
    onChip: (chip: KycStateChip) => void;
    onChanged: () => void;
}

/**
 * The advertiser KYC tab — the frame's three tiles, the filtered list on
 * the left and the case on the right. The list is the queue's rows; the
 * case is its own read (`GET /advertiser-kyc/:id`), which is where the
 * per-tile decisions and the liveness video live.
 *
 * N3-B / N3-C (the owner, 14 Sep 2026): the queue lists PARTIES — every
 * Advertiser profile from the moment it exists, in one of six states — and
 * the chips are those states (plus Escalated) with the server's counts,
 * the chip in the URL. A profile with no record (or one only asked for) is
 * drawn from the party alone: name, ids, contact, when it arrived, a state
 * pill, and the actions its state allows — the one-click Digio request
 * (`POST /advertiser-kyc/:id/request` over the PROFILE id, behind
 * `kyc.edit`), the manual ask, Record at the desk (`PUT /advertiser-kyc/:id`
 * over the profile id, which opens the record). A console-created
 * advertiser with no app account is on the queue like any other; the
 * request dialog says the Digio link goes to the profile's contact and no
 * ADX notice is sent. The roster picker is gone: the queue lists them now.
 *
 * Lot G (Q127/142): an escalated row carries the pill with its source and
 * who it went to (G11-1: named by the row's own `escalatedTo`). Lot N: a
 * row says when the desk asked, who and over which channel, and who
 * recorded the documents.
 */
export function AdvertiserKycView({ loaded, chip, onChip, onChanged }: AdvertiserKycViewProps) {
    const { user } = useAuth();
    const { everything, visible: queue } = loaded;
    const cases = queue.cases;
    const [selection, setSelection] = React.useState<FilterSelection>({});
    const [recording, setRecording] = React.useState<AdvertiserKycCase | null>(null);
    const [query, setQuery] = React.useState("");
    const [selectedId, setSelectedId] = React.useState<string | null>(null);

    const facets: Facet[] = React.useMemo(
        () => [
            {
                id: "type",
                label: "Advertiser type",
                options: (Object.keys(ADVERTISER_KYC_TYPE_META) as (keyof typeof ADVERTISER_KYC_TYPE_META)[]).map((value) => ({
                    value,
                    label: ADVERTISER_KYC_TYPE_META[value],
                    count: cases.filter((item) => item.kycType === value).length,
                })),
            },
            {
                id: "sla",
                label: "SLA",
                options: [{ value: "breached", label: "Past SLA", count: cases.filter((item) => item.slaBreached).length }],
            },
            {
                id: "assigned",
                label: "Working it",
                options: [
                    { value: "me", label: "Assigned to me", count: user ? cases.filter((item) => item.assignedToId === user.id).length : 0 },
                    { value: "none", label: "Unassigned", count: cases.filter((item) => item.kycId && !item.assignedToId).length },
                ],
            },
        ],
        [cases, user]
    );

    const visible = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        const types = selection.type ?? [];
        const sla = selection.sla ?? [];
        const assigned = selection.assigned ?? [];
        return cases
            .filter((item) => (types.length ? types.includes(item.kycType) : true))
            .filter((item) => (sla.includes("breached") ? item.slaBreached : true))
            .filter((item) =>
                assigned.includes("me") ? user !== null && item.assignedToId === user.id : assigned.includes("none") ? Boolean(item.kycId) && !item.assignedToId : true
            )
            .filter((item) => (needle ? [item.advertiser, item.displayId ?? "", item.contact, item.email].join(" ").toLowerCase().includes(needle) : true));
    }, [cases, selection, query, user]);

    const selected = cases.find((item) => item.id === selectedId && visible.some((v) => v.id === item.id)) ?? visible[0] ?? null;
    /* A party with nothing submitted has no case to open: the pane draws the party and its actions instead. */
    const selectedHasCase = selected !== null && selected.kycId !== null && selected.state !== "REQUESTED" && selected.state !== "AWAITING_DOCUMENTS";

    const counts = everything.counts;

    return (
        <div className="space-y-5">
            <PageHeader title="Advertiser KYC" subtitle={`${kycHeadline(counts, everything.breached)} · ${everything.slaHours}h review SLA`} />

            <div className="grid gap-4 md:grid-cols-3">
                <KpiCard
                    stat={{
                        id: "awaiting",
                        label: "Awaiting documents",
                        value: String(counts.AWAITING_DOCUMENTS + counts.REQUESTED),
                        hint: counts.REQUESTED ? `${counts.REQUESTED} asked and not answered` : "Nobody has been asked yet",
                    }}
                />
                <KpiCard
                    stat={{
                        id: "review",
                        label: "Under review",
                        value: String(counts.PENDING + counts.NEEDS_INFO),
                        hint: everything.breached ? `${everything.breached} past the ${everything.slaHours}h SLA` : `All within the ${everything.slaHours}h SLA`,
                        delta: everything.breached ? "Review first" : undefined,
                        deltaTone: everything.breached ? "negative" : "neutral",
                    }}
                />
                <KpiCard stat={{ id: "verified", label: "Verified", value: String(counts.VERIFIED), hint: "Can book campaigns" }} />
            </div>

            <FilterChips<KycStateChip> value={chip} onChange={onChip} chips={kycStateChips(counts, everything.total)} />

            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
                <Card className="rounded-lg border-border shadow-none">
                    <div className="space-y-2.5 border-b px-4 py-3">
                        <FilterPanel
                            facets={facets}
                            selection={selection}
                            onChange={setSelection}
                            resultCount={visible.length}
                            search={{ value: query, onChange: setQuery, placeholder: "Advertiser, display id, contact or email" }}
                            className="w-full justify-center"
                        />
                        <ActiveFilters facets={facets} selection={selection} onChange={setSelection} resultCount={visible.length} />
                    </div>

                    {visible.length ? (
                        <ul className="max-h-[560px] divide-y overflow-y-auto">
                            {visible.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(item.id)}
                                        aria-current={selected?.id === item.id ? "true" : undefined}
                                        className={cn(
                                            "w-full px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                            selected?.id === item.id ? "bg-muted/60" : "hover:bg-muted/40"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="truncate text-sm font-medium text-foreground">{item.advertiser}</p>
                                            <StatusBadge status={KYC_STATE_META[item.state]} />
                                        </div>
                                        {item.escalation && (
                                            <div className="mt-1">
                                                <StatusBadge status={escalationChip(item.escalation)!} />
                                            </div>
                                        )}
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {[item.displayId, ADVERTISER_KYC_TYPE_META[item.kycType], item.kycId ? (item.method === "DIGIO" ? "Digio" : "Documents") : item.createdAt ? `arrived ${formatDate(item.createdAt)}` : null]
                                                .filter(Boolean)
                                                .join(" · ")}
                                            {item.assignedToId ? ` · ${user && item.assignedToId === user.id ? "you" : item.assignedTo?.name?.trim() || item.assignedToId}` : ""}
                                        </p>
                                        {(item.request || (item.recorded && item.recorded.via !== "SELF")) && (
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground" data-testid="desk-line">
                                                {item.request
                                                    ? `Requested ${formatDate(item.request.at)}${personLabel(item.request.by) ? ` · ${personLabel(item.request.by)}` : ""} · ${REQUEST_CHANNEL_LABEL[item.request.channel]}${item.request.open ? " · awaiting the advertiser" : ""}`
                                                    : ""}
                                                {item.request && item.recorded && item.recorded.via !== "SELF" ? " · " : ""}
                                                {item.recorded && item.recorded.via !== "SELF" ? `Recorded at the desk${personLabel(item.recorded.by) ? ` by ${personLabel(item.recorded.by)}` : ""}` : ""}
                                            </p>
                                        )}
                                        {item.ageHours !== null && (
                                            <p className={cn("mt-1.5 text-xs tabular-nums", item.slaBreached ? "font-medium text-danger" : "text-muted-foreground")}>
                                                {item.slaBreached ? `${Math.abs(item.slaHoursLeft)}h past SLA` : `${item.slaHoursLeft}h left on SLA`}
                                            </p>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{chip === "all" ? "Nothing matches these filters." : "Nobody under this chip."}</p>
                    )}
                </Card>

                {selected && selectedHasCase ? (
                    <AdvertiserCaseDesk key={selected.id} row={selected} onChanged={onChanged} />
                ) : selected ? (
                    <AdvertiserPartyPane key={selected.id} row={selected} onRecord={() => setRecording(selected)} onChanged={onChanged} />
                ) : (
                    <Card className="rounded-lg border-border p-10 text-center shadow-none">
                        <p className="text-sm font-medium text-foreground">Nobody to review</p>
                        <p className="mt-1 text-sm text-muted-foreground">Choose another chip or clear the filters.</p>
                    </Card>
                )}
            </div>

            {recording && (
                <RecordAtDeskDialog
                    key={recording.id}
                    open
                    onOpenChange={(open) => !open && setRecording(null)}
                    party={recording.advertiser}
                    userId={recording.userId}
                    purpose="ADVERTISER_KYC"
                    tiles={advertiserDeskTiles(recording.kycType)}
                    facts={ADVERTISER_DESK_FACTS}
                    initial={
                        recording.kycId
                            ? {
                                  documents: Object.fromEntries(recording.documents.filter((item) => item.url).map((item) => [item.field, item.url ?? undefined])),
                                  panNumber: recording.panNumber ?? "",
                              }
                            : undefined
                    }
                    needsInfo={recording.status === "NEEDS_INFO"}
                    onSubmit={async (body) => {
                        // N3-B: the desk records over the PROFILE id; with no record yet the PUT opens one, typed by the profile's entity type.
                        await advertiserKycService.recordAtDesk(recording.profileId ?? recording.id, recording.kycId ? body : { ...body, kycType: recording.kycType });
                        return { caseHref: "/kyc/advertisers" };
                    }}
                    onRecorded={() => {
                        setRecording(null);
                        setSelectedId(recording.id);
                        onChanged();
                    }}
                />
            )}
        </div>
    );
}

/**
 * The right-hand pane for a party with nothing submitted — awaiting
 * documents, or asked and waiting. There is no case to read, so the pane
 * draws the profile and the actions its state allows.
 */
function AdvertiserPartyPane({ row, onRecord, onChanged }: { row: AdvertiserKycCase; onRecord: () => void; onChanged: () => void }) {
    const targetId = row.profileId ?? row.id;
    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="advertiser-party-pane">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">{row.advertiser}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{row.state === "REQUESTED" ? "Asked for their KYC; nothing has come back yet." : "On the queue since the profile was created; nothing has been asked or submitted."}</p>
                </div>
                <StatusBadge status={KYC_STATE_META[row.state]} />
            </div>

            <FieldList
                className="mt-4"
                items={[
                    ["Display id", row.displayId ?? "—"],
                    ["Entity", ADVERTISER_KYC_TYPE_META[row.kycType]],
                    ["Contact", row.contact],
                    ["Email", row.email],
                    ["City", row.city ?? "—"],
                    ["Arrived", row.createdAt ? formatDate(row.createdAt) : "—"],
                    ["App account", row.userId ? "Yes" : "None — created on the console; the Digio link goes to the contact above and ADX notices are not sent"],
                    ["Requested", requestLine(row.request) ?? "—"],
                    ["Recorded by", recordedLine(row.recorded) ?? "—"],
                ]}
            />

            <KycRowActions
                className="mt-5 border-t pt-4"
                size="default"
                state={row.state}
                party={row.advertiser}
                hasAccount={row.userId !== null}
                contact={row.contact !== "—" ? row.contact : row.email !== "—" ? row.email : null}
                request={row.request}
                onDigio={() => advertiserKycService.requestDigio(targetId)}
                onRequest={(channel, note) => advertiserKycService.request(targetId, channel, note)}
                onRecord={onRecord}
                onChanged={onChanged}
            />
        </Card>
    );
}
