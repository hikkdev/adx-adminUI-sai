"use client";

import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakdownTable, CountTile, MixBar, MoneyTile, SectionOverviewLoader, SeriesCard, TopList } from "@/components/adx/overview";
import { formatMoney, formatNumber } from "@/lib/format";
import { SECTION_META, consoleHref, kycMixItems, typedSpellingsHover, type AgentsOverview } from "@/services/section-overviews";
import { AgentsNav } from "./agents-nav";

const meta = SECTION_META.agents;

/**
 * The Agents section's Overview tab — package O-C over
 * `GET /section-overviews/agents`: the tiles (the two roles one agent may
 * hold both of, the tiers), the incentives paid, the three day series
 * (onboardings done, visits completed, jobs completed), the by-city and
 * by-tier breakdowns, the top ten by commission and — with a city picked —
 * the city's leaderboard as `agents` answers it (the board's own rolling
 * thirty days, not this window).
 */
export function AgentsOverviewView() {
    return (
        <SectionOverviewLoader
            section="agents"
            title="Agents"
            subtitle="The field force — the window's movement against the same number of days before it."
            actions={
                <>
                    <Button variant="outline" className="h-9 bg-card" asChild>
                        <Link href="/growth/leaderboard">
                            <Trophy className="size-4" />
                            Leaderboard
                        </Link>
                    </Button>
                    <Button variant="outline" className="h-9 bg-card" asChild>
                        <Link href={meta.directory}>
                            <Plus className="size-4" />
                            Add agent
                        </Link>
                    </Button>
                </>
            }
            nav={<AgentsNav />}
        >
            {(data, window) => <AgentsOverviewBody data={data} link={(href: string | null) => consoleHref("agents", href, window)} />}
        </SectionOverviewLoader>
    );
}

export function AgentsOverviewBody({ data, link }: { data: AgentsOverview; link: (href: string | null) => string | null }) {
    const { tiles, money, series, breakdowns, top } = data;
    const roles = tiles.byRole.publisherAgents + tiles.byRole.advertiserAgents;
    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <CountTile label="Agents" figure={tiles.total} hint="as at the window's close" href={meta.directory} />
                <CountTile label="New in window" figure={tiles.newInWindow} hint="profiles created" />
                <CountTile label="Active" figure={tiles.active} hint="an order touched or a visit in the window" />
                <CountTile label="Suspended" figure={tiles.suspended} />
                <CountTile label="Onboardings done" figure={series.onboardingsDone.total} hint="publishers and advertisers activated with an agent" />
                <CountTile label="Visits completed" figure={series.visitsCompleted.total} href="/visits" />
                <CountTile label="Jobs completed" figure={series.jobsCompleted.total} hint="orders approved complete" href="/orders" />
                <MoneyTile label="Incentives paid" figure={money.incentivesPaid} hint="credited net" />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <MixBar
                    title="KYC by state"
                    hint="Every agent, by where their verification stands now — each state opens the queue with that chip on."
                    items={kycMixItems(tiles.kyc, meta.kycQueue)}
                />
                <MixBar
                    title="By role"
                    hint={`${formatNumber(roles)} role grants — an agent who works both sides holds both.`}
                    items={[
                        { key: "AGENT_PUBLISHER", label: "Publisher agents", count: tiles.byRole.publisherAgents, href: null, tone: "info" },
                        { key: "AGENT_ADVERTISER", label: "Advertiser agents", count: tiles.byRole.advertiserAgents, href: null, tone: "neutral" },
                    ]}
                />
                <MixBar
                    title="By tier"
                    hint="The tier each agent holds now."
                    items={tiles.byTier.items.map((row, index) => ({
                        key: row.key,
                        label: row.label,
                        count: row.count,
                        href: link(row.href),
                        tone: (["success", "info", "warning", "neutral", "danger"] as const)[index % 5],
                    }))}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <SeriesCard id="onboardings" title="Onboardings done" hint="Parties activated with an agent on them, by day" series={series.onboardingsDone} />
                <SeriesCard id="visits" title="Visits completed" hint="Field visits marked complete, by day" series={series.visitsCompleted} />
                <SeriesCard id="jobs" title="Jobs completed" hint="Orders approved complete, by day" series={series.jobsCompleted} />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <BreakdownTable
                    title="By city"
                    hint="Agents per city, as of now — a city narrows this overview and brings its leaderboard."
                    labelHeading="City"
                    page={breakdowns.byCity}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    hoverFor={typedSpellingsHover}
                    columns={[{ key: "count", label: "Agents", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
                <BreakdownTable
                    title="By tier"
                    hint="Agents per tier, as of now."
                    labelHeading="Tier"
                    page={breakdowns.byTier}
                    initialSort="count"
                    linkFor={(row) => link(row.href)}
                    columns={[{ key: "count", label: "Agents", align: "right", render: (row) => formatNumber(row.count), sortValue: (row) => row.count }]}
                />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
                <TopList
                    title="Top agents by commission"
                    hint="Incentives credited in the window, the ten largest."
                    items={top.byCommission.items.map((row) => ({ key: row.key, label: row.label, displayId: row.displayId, href: link(row.href), primary: formatMoney(row.amount) }))}
                    emptyMessage="No agent was credited an incentive in this window."
                />
                <TopList
                    title={top.leaderboard?.cohort.city ? `Leaderboard · ${top.leaderboard.cohort.city}` : "Leaderboard"}
                    hint={
                        top.leaderboard
                            ? `The board's rolling thirty days, not this window — a cohort of ${formatNumber(top.leaderboard.cohort.size)}${top.leaderboard.cohort.enough ? "" : `, below the ${formatNumber(top.leaderboard.cohort.minimum)} it needs`}.`
                            : "The board is a city cohort — pick a city above to see its podium."
                    }
                    items={(top.leaderboard?.top ?? []).map((row) => ({
                        key: row.agentId,
                        label: row.name,
                        displayId: row.locality,
                        href: `/agents/${row.agentId}`,
                        primary: formatMoney(row.earnings),
                        secondary: `#${row.rank}`,
                    }))}
                    emptyMessage={top.leaderboard ? "Nobody on the podium yet." : "No city picked."}
                />
            </div>
        </>
    );
}
