"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isLive } from "@/lib/api-config";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { AccountClosure, CloseAccountButton } from "@/components/adx/account-closure";
import { ActivityTimeline } from "@/components/adx/activity-timeline";
import { DetailShell } from "@/components/adx/detail-shell";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import {
    REJECTION_LABEL,
    driverHealthy,
    hoursLabel,
    orderTypesLabel,
    priorityLabel,
    ratePercent,
    tierLabel,
    workingDaysLabel,
    type AgentOffers,
    type AgentRating,
} from "@/services/agents";
import type { AgentQuality } from "@/services/leads";
import { type GrantView, type ScanView } from "@/services/access";
import { agentKycService, type AgentKycCase } from "@/services/agent-kyc";
import { requestOf } from "@/services/kyc";
import { KYC_STATE_META } from "@/services/kyc-state";
import { KycRowActions } from "@/app/(admin)/kyc/_shared/kyc-row-actions";
import type { LeaderboardView, MilestoneBoard, TierView } from "@/services/growth";
import { AgentAccessTab } from "./agent-access-tab";
import { AgentEngagementCard } from "./agent-engagement-card";
import { AssignedTasksCard } from "@/app/(admin)/tasks/assigned-tasks-card";
import { AgentMilestoneProgressCard, AgentMilestonesTab } from "./agent-milestones-tab";
import { AgentPayoutsTab } from "./agent-payouts-tab";
import { AgentPromotionHistory, AgentTierCard } from "./agent-tier-card";
import { AgentQualityCard } from "./agent-quality-card";
import { EditAgentDialog } from "./edit-agent-dialog";
import { ScanForSignalsButton } from "@/components/adx/scan-for-signals";
import { SuspensionActions } from "@/components/adx/suspend-dialog";
import { SuspensionCard } from "@/components/adx/suspension-card";
import { ReviewsCard } from "@/components/adx/reviews-card";
import { countRunningOrders, type SuspensionView } from "@/services/suspension";
import { incentiveEventLabel, type Incentive, type IncentiveStatus, type PayoutMethod } from "@/services/finance";
import {
    AGENT_STATUS_META,
    ORDER_STATUS_META,
    type Agent,
    type Order,
    type StatusMeta,
} from "@/types";

interface AgentDetailProps {
    agent: Agent;
    orders: Order[];
    /** Null when the finance API was not asked — the console is on fixtures. */
    incentives: Incentive[] | null;
    /** D6: every grant this agent has held, and every scan they made. Null when the API is off. */
    grants: GrantView[] | null;
    scans: ScanView[] | null;
    /** D4: the desk's KYC record. Null when nothing is recorded, or the API is off. */
    kyc: AgentKycCase | null;
    /** D5: where they are paid. Null when the finance API is off. */
    methods: PayoutMethod[] | null;
    /** Every offer they have had, folded. Null when the API is off. */
    offers: AgentOffers | null;
    /** D5: the same three drivers the agent reads on their own rating screen. */
    rating: AgentRating | null;
    /** DR 05: the rung, the step, the benefits and the history. Null when the API is off. */
    tier: TierView | null;
    /** DR 05: this week's board for the agent's city. Null with the API off, no city, or a failed read. */
    leaderboard: LeaderboardView | null;
    /** DR 05: the agent's milestone board. Null when the API is off. */
    milestones: MilestoneBoard | null;
    /** LH10: the quality score off the sampled field work. Null when the leads API is off or the read failed. */
    quality: AgentQuality | null;
    /** Lot A: the case and its history. Null when the API is off or the read failed. */
    suspension: SuspensionView | null;
    /** Re-read after a withdrawal, a profile save, a suspension, or a payout-method change. */
    onChanged?: () => void;
}

const STATUS_HINT: Record<Agent["status"], string> = {
    active: "Offered work; can sign in",
    on_leave: "Not offered work until ops says so",
    suspended: "Not offered work — under review",
    deactivated: "Cannot sign in",
};

const INCENTIVE_STATUS_META: Record<IncentiveStatus, StatusMeta> = {
    PENDING_VERIFICATION: { label: "Awaiting verification", tone: "warning" },
    CREDITED: { label: "Credited", tone: "success" },
    REJECTED: { label: "Rejected", tone: "danger" },
    // LH10: the activation reward that came back when the account did not last.
    REVERSED: { label: "Clawed back", tone: "danger" },
};

/**
 * One agent, as the API describes them.
 *
 * The wireframe's four tiles were Publishers onboarded, Orders completed this
 * month, Earnings this month and Status with a "last active" line. The first
 * three are aggregates nothing computes and the join carries no
 * `lastLoginAt`, so the tiles hold the four facts the profile does have — the
 * identifier, the tier, their standing, and when they joined — rather than a
 * zero dressed as a figure. Territory, zone and works-from are real since D5
 * — ops records them, and the auto-assign sweep honours the status and the
 * cap — while rating stays off the card: nothing computes one.
 *
 * DR 05 made two more of the frame's elements real: the tier is a rung with
 * a level, a step to the next one and a history, and the "Milestone
 * progress" card the frame drew beside the profile is derived from the
 * agent's own record on every read. Both come from the API and say so when
 * it is off; the Milestones tab is the whole board.
 */
export function AgentDetail({
    agent,
    orders,
    incentives,
    grants,
    scans,
    kyc,
    methods,
    offers,
    rating,
    tier,
    leaderboard,
    milestones,
    quality,
    suspension,
    onChanged,
}: AgentDetailProps) {
    const router = useRouter();
    const [editing, setEditing] = React.useState(false);
    /* The publishers' stars ride on the rating: E7-3 carries the snapshot's
       own average and count beside the driver; the card below draws the
       reviews themselves. */
    const reviewDriver = rating?.drivers.find((driver) => driver.key === "review") ?? null;
    const reviewAvg = rating?.reviewAvg ?? null;
    const reviewCount = rating?.reviewCount ?? reviewDriver?.sample ?? 0;
    /* The case read is the fresher of the two; the row's own columns stand in
       while it could not be read, so the buttons still know what is in force. */
    const scopes = suspension?.scopes ?? agent.suspensionScopes ?? [];
    const place = [agent.city, agent.state].filter(Boolean).join(", ");
    /* The tier view is fresher than the profile row: it is the rung after
       the ladder was consulted, while the row is what was last written back. */
    const rung = tier ? tier.current.label : tierLabel(agent.tier, agent.tierLevel);
    const subtitle = [agent.displayId, place, `${rung} tier`]
        .filter(Boolean)
        .join(" · ");

    return (
        /* Lot A: the closure state of the account behind the profile, shared
           by the banner above the header and the button in it. E10-1: the
           columns come off `GET /agents/:id` (`user.closedAt`), so nothing is
           read a second time. */
        <AccountClosure userId={agent.userId} name={agent.name ?? agent.mobile} closed={agent.user} onChanged={onChanged}>
        {(closure) => (
        <DetailShell
            backHref="/agents/directory"
            backLabel="Agents"
            title={agent.name ?? agent.mobile}
            subtitle={subtitle}
            actions={
                <div className="flex items-center gap-2">
                    <Button variant="outline" className="bg-card" onClick={() => setEditing(true)}>
                        Edit profile
                    </Button>
                    {/* Lot A: the status is no longer set from the edit
                        dialog. BLOCK_NEW is what suspends an agent, and
                        lifting it is what brings them back. */}
                    <SuspensionActions
                        partyType="AGENT"
                        partyId={agent.id}
                        partyName={agent.name ?? agent.mobile}
                        current={scopes}
                        runningOrders={countRunningOrders(orders)}
                        onDone={() => onChanged?.()}
                    />
                    {/* Lot G (Q138): the fraud signals over this agent, on the fraud desk. */}
                    <ScanForSignalsButton subjectType="AGENT" subjectId={agent.id} />
                    <CloseAccountButton slot={closure} />
                    {/* A portal; it lives here so the button and its dialog share one owner. */}
                    <EditAgentDialog
                        agent={agent}
                        open={editing}
                        onOpenChange={setEditing}
                        onSaved={() => onChanged?.()}
                    />
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href={`/kyc/agents/${agent.id}`}>{kyc ? "KYC record" : "Record KYC"}</Link>
                    </Button>
                    <Button variant="outline" className="bg-card" asChild>
                        <Link href="/orders">Assign an order</Link>
                    </Button>
                </div>
            }
            kpis={[
                {
                    id: "agent-id",
                    label: "Agent ID",
                    value: agent.displayId ?? "Not issued",
                    hint: agent.displayId
                        ? "Issued once, never reissued"
                        : "Created before identifiers were minted",
                },
                {
                    id: "tier",
                    label: "Tier",
                    value: rung,
                    hint: tier?.current.pinned
                        ? "Pinned by ops; the ladder is not consulted"
                        : "Derived from accounts onboarded; written back on read",
                },
                {
                    id: "status",
                    label: "Status",
                    value: AGENT_STATUS_META[agent.status].label,
                    hint: scopes.length
                        ? `Suspended: ${scopes.length} section${scopes.length === 1 ? "" : "s"} stopped`
                        : STATUS_HINT[agent.status],
                },
                { id: "joined", label: "Joined", value: formatDate(agent.joinedAt) },
            ]}
            tabs={[
                {
                    value: "overview",
                    label: "Overview",
                    content: (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Profile</h3>
                                <FieldList
                                    className="mt-4"
                                    items={[
                                        ["Phone", agent.mobile],
                                        ["Email", agent.email ?? "—"],
                                        ["Agent ID", agent.displayId ?? "—"],
                                        ["City", agent.city ?? "—"],
                                        ["State", agent.state ?? "—"],
                                        ["Business / org", agent.businessName ?? "Independent agent"],
                                        ["Territory", agent.territory ?? "—"],
                                        ["Home zone", agent.homeZone ?? "—"],
                                        ["Radius", agent.radiusKm === null ? "—" : `${agent.radiusKm} km`],
                                        ["Working days", workingDaysLabel(agent.workingDays)],
                                        ["Hours", hoursLabel(agent.hoursFrom, agent.hoursTo)],
                                        ["Auto-accept in zone", agent.autoAcceptInZone ? "On" : "Off"],
                                        ["Order types", orderTypesLabel(agent.orderTypes)],
                                        ["Max active orders", agent.maxActiveOrders ?? "No cap"],
                                        ["Tier", rung],
                                        [
                                            "KYC",
                                            /* N3-C: the party read's own state — the queue row's word — with the actions it allows below the card. */
                                            <StatusBadge key="kyc" status={KYC_STATE_META[agent.kyc.state]} />,
                                        ],
                                        [
                                            "Referral code",
                                            <span key="referral" className="font-mono text-xs">
                                                {agent.referralCode}
                                            </span>,
                                        ],
                                        ["Joined", formatDate(agent.joinedAt)],
                                    ]}
                                />
                                {/* N3-C: the actions the agent's KYC state allows — the one-click Digio request, the manual ask, Record at the desk (the record sheet), Open the case. */}
                                {isLive("kyc") && (
                                    <KycRowActions
                                        className="mt-4 border-t pt-4"
                                        size="default"
                                        state={agent.kyc.state}
                                        party={agent.name ?? agent.mobile}
                                        hasAccount
                                        contact={agent.mobile}
                                        request={requestOf({ requestedAt: agent.kyc.requestedAt, requestedChannel: agent.kyc.requestedChannel, submittedAt: agent.kyc.submittedAt })}
                                        caseHref={kyc || agent.kyc.kycId ? `/kyc/agents/${agent.id}` : null}
                                        onDigio={() => agentKycService.requestDigio(agent.id)}
                                        onRequest={(channel, note) => agentKycService.request(agent.id, channel, note)}
                                        onRecord={() => router.push(`/kyc/agents/${agent.id}`)}
                                        onChanged={() => onChanged?.()}
                                    />
                                )}
                            </Card>
                            {/* AG-3: the ladder stage, the grade and the engagement the desk set; grade changes and the exit live on the card. */}
                            {agent.engagement && (
                                <AgentEngagementCard
                                    agentId={agent.id}
                                    name={agent.name ?? agent.mobile}
                                    facts={agent.engagement}
                                    applicationHref={`/agents/applications/${agent.id}`}
                                    onChanged={() => onChanged?.()}
                                />
                            )}
                            <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agent-rating-card">
                                <h3 className="text-base font-semibold text-foreground">Rating</h3>
                                {rating === null ? (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        The rating is derived from this agent&rsquo;s orders, assignments and check-ins.
                                        Turn the agents domain on to see it.
                                    </p>
                                ) : rating.provisional ? (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        Not rated yet &mdash; {rating.sample} finished job{rating.sample === 1 ? "" : "s"} in the last{" "}
                                        {rating.windowDays} days, and a rating needs five. The drivers below are what there is so far.
                                    </p>
                                ) : (
                                    <div className="mt-3 flex items-baseline gap-2.5">
                                        <span className="text-metric text-foreground">{rating.score?.toFixed(1)}</span>
                                        <span className="text-sm text-muted-foreground">
                                            {rating.percentileLabel ?? `over ${rating.sample} jobs in ${rating.windowDays} days`}
                                        </span>
                                    </div>
                                )}
                                {rating && (
                                    <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground" data-testid="agent-review-stars">
                                        <Star className="size-4 fill-warning text-warning" aria-hidden />
                                        {reviewAvg === null ? (
                                            <span className="text-muted-foreground">No stars from publishers yet</span>
                                        ) : (
                                            <>
                                                <span className="font-semibold tabular-nums">{reviewAvg}</span>
                                                <span className="text-muted-foreground">
                                                    from {reviewCount} publisher review{reviewCount === 1 ? "" : "s"}
                                                </span>
                                            </>
                                        )}
                                    </p>
                                )}
                                {rating && (
                                    <ul className="mt-4 space-y-2.5">
                                        {rating.drivers.map((driver) => {
                                            const percent = ratePercent(driver.rate);
                                            const healthy = driverHealthy(driver);
                                            return (
                                                <li key={driver.key} data-testid={`agent-driver-${driver.key}`}>
                                                    <div className="flex items-center justify-between gap-2 text-sm">
                                                        <span className="text-foreground">{driver.label}</span>
                                                        <span className={cn("font-medium tabular-nums", healthy === false && "text-danger")}>
                                                            {percent === null ? "No data" : `${percent}%`}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                                                        <div
                                                            className={cn(
                                                                "h-1.5 rounded-full",
                                                                healthy === false ? "bg-danger" : healthy === null ? "bg-border" : "bg-success"
                                                            )}
                                                            style={{
                                                                width: `${Math.round(
                                                                    (driver.rate === null ? 0 : driver.inverted ? 1 - driver.rate : driver.rate) * 100
                                                                )}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {percent === null ? "Nothing to judge this on yet." : `Over ${driver.sample} in ${rating.windowDays} days.`}
                                                    </p>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </Card>
                            {/* DR 05: the rung beside the rating, and the frame's
                                milestone-progress card now that something computes it. */}
                            <AgentTierCard
                                agentId={agent.id}
                                agentName={agent.name ?? agent.mobile}
                                city={agent.city}
                                tier={tier}
                                leaderboard={leaderboard}
                                onChanged={onChanged}
                            />
                            <AgentMilestoneProgressCard board={milestones} />
                            {/* LH10: what the sampled field work says, beside the rating. */}
                            <AgentQualityCard quality={quality} />
                            {/* Lot D (Q112): the publishers' stars — the rating's fourth driver. */}
                            <ReviewsCard
                                subjectType="AGENT"
                                subjectId={agent.id}
                                // E7-3: the snapshot's own average and count, off the rating read.
                                ratingAvg={reviewAvg}
                                reviewCount={reviewCount}
                                onChanged={onChanged}
                            />
                            <SuspensionCard view={suspension} className="lg:col-span-2" />
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <h3 className="text-base font-semibold text-foreground">Offers</h3>
                                {offers === null ? (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        Every offer this agent has had, with the five coded reasons
                                        counted, is read from the API. Turn the agents domain on to
                                        see it.
                                    </p>
                                ) : offers.offered === 0 ? (
                                    <p className="mt-4 text-sm text-muted-foreground">
                                        Nothing has been offered to this agent yet.
                                    </p>
                                ) : (
                                    <>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            The count behind &ldquo;frequent rejections lower your
                                            offer priority&rdquo;, and the lane the sweep puts them in.
                                        </p>
                                        <FieldList
                                            className="mt-4"
                                            items={[
                                                [
                                                    "Offer priority",
                                                    <StatusBadge
                                                        key="lane"
                                                        status={{
                                                            label: priorityLabel(offers.priority),
                                                            tone: offers.priority.lane === "FAST" ? "success" : "warning",
                                                        }}
                                                    />,
                                                ],
                                                ["Offered", offers.offered],
                                                ["Accepted", offers.accepted],
                                                ["Waiting", offers.pending],
                                                ["Declined", offers.declined],
                                                ["Left to expire", offers.expired],
                                                ...Object.entries(offers.byReason).map(
                                                    ([code, count]) =>
                                                        [`· ${REJECTION_LABEL[code] ?? code}`, count] as [string, number]
                                                ),
                                            ]}
                                        />
                                    </>
                                )}
                            </Card>
                            <AgentPromotionHistory tier={tier} />
                        </div>
                    ),
                },
                {
                    value: "milestones",
                    label: "Milestones",
                    content: <AgentMilestonesTab board={milestones} />,
                },
                {
                    value: "orders",
                    label: "Orders",
                    content: (
                        <SimpleTable<Order>
                            rows={orders}
                            rowKey={(order) => order.id}
                            emptyMessage="No orders assigned to this agent on the board."
                            columns={[
                                {
                                    key: "order",
                                    label: "Order",
                                    render: (order) => (
                                        <Link
                                            href={`/orders/${order.id}`}
                                            className="font-medium text-foreground underline-offset-4 hover:underline"
                                        >
                                            {order.listing}
                                        </Link>
                                    ),
                                },
                                {
                                    key: "city",
                                    label: "City",
                                    render: (order) => (
                                        <span className="text-muted-foreground">
                                            {order.city ?? "—"}
                                        </span>
                                    ),
                                },
                                {
                                    key: "flight",
                                    label: "Flight",
                                    render: (order) =>
                                        order.startDate ? formatDate(order.startDate) : "Not dated",
                                },
                                {
                                    key: "status",
                                    label: "Status",
                                    render: (order) => (
                                        <StatusBadge status={ORDER_STATUS_META[order.status]} />
                                    ),
                                },
                            ]}
                        />
                    ),
                },
                {
                    value: "earnings",
                    label: "Earnings",
                    content:
                        incentives === null ? (
                            <Card className="rounded-lg border-border p-5 shadow-none">
                                <p className="text-sm text-muted-foreground">
                                    Incentives are read from the finance API, and the console is
                                    not connected to it. Turn the API on to see what ops has
                                    recorded for this agent.
                                </p>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                    What ops has recorded for this agent, each verified before any
                                    money moves. There is no monthly earnings figure: the API
                                    computes none.
                                </p>
                                <SimpleTable<Incentive>
                                    rows={incentives}
                                    rowKey={(row) => row.id}
                                    emptyMessage="No incentives recorded for this agent yet."
                                    columns={[
                                        {
                                            key: "date",
                                            label: "Date",
                                            render: (row) => (
                                                <span className="text-muted-foreground">
                                                    {formatDateTime(row.createdAt)}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "event",
                                            label: "Event",
                                            render: (row) => (
                                                <div className="min-w-0">
                                                    <p className="font-medium text-foreground">
                                                        {incentiveEventLabel(row.event)}
                                                    </p>
                                                    {row.note && (
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {row.note}
                                                        </p>
                                                    )}
                                                </div>
                                            ),
                                        },
                                        {
                                            key: "amount",
                                            label: "Amount",
                                            render: (row) => (
                                                <span className="font-medium tabular-nums">
                                                    {formatMoney(row.amount)}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "net",
                                            label: "Net of tax",
                                            render: (row) => (
                                                <span className="tabular-nums text-muted-foreground">
                                                    {formatMoney(row.netAmount)}
                                                </span>
                                            ),
                                        },
                                        {
                                            key: "status",
                                            label: "Status",
                                            render: (row) => (
                                                <StatusBadge
                                                    status={INCENTIVE_STATUS_META[row.status]}
                                                />
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        ),
                },
                {
                    value: "payouts",
                    label: "Payouts",
                    content: (
                        <AgentPayoutsTab
                            methods={methods}
                            userId={agent.userId}
                            agentName={agent.name ?? agent.mobile}
                            onChanged={() => onChanged?.()}
                        />
                    ),
                },
                {
                    value: "access",
                    label: "Access",
                    content: <AgentAccessTab grants={grants} scans={scans} onChanged={onChanged} />,
                },
                {
                    value: "tasks",
                    label: "Tasks",
                    /* Lot AA: coordination only — a task assigned to an agent never pays; paid field work stays under Milestones and Orders. */
                    content: <AssignedTasksCard userId={agent.userId} name={agent.name ?? agent.mobile} />,
                },
                {
                    value: "activity",
                    label: "Activity",
                    /* Hand-written rows say AgentProfile; the generic admin-write tap says Agent. Same id. */
                    content: (
                        <ActivityTimeline
                            targets={[
                                { type: "AgentProfile", id: agent.id },
                                { type: "Agent", id: agent.id },
                            ]}
                            noun="this agent"
                        />
                    ),
                },
            ]}
        />
        )}
        </AccountClosure>
    );
}
