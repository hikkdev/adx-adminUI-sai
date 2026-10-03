"use client";

import { notFound } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import {
    agentService,
    compensationService,
    type AgentCompensationHistory,
    type AgentOffers,
    type AgentRating,
    type AgentStanding,
} from "@/services/agents";
// LH10: the agent's quality score comes off the leads domain, beside the rating.
import { integrityService, type AgentQuality } from "@/services/leads";
import { orderService } from "@/services/orders";
import { financeReadsApi, financeService, type Incentive, type PayoutMethod } from "@/services/finance";
import { accessService, type GrantView, type ScanView } from "@/services/access";
import { agentKycService, type AgentKycCase } from "@/services/agent-kyc";
import { growthService, type LeaderboardView, type MilestoneBoard, type TierView } from "@/services/growth";
import { suspensionService, type SuspensionView } from "@/services/suspension";
import type { Agent, Order } from "@/types";
import { AgentDetail } from "./agent-detail";

interface Loaded {
    agent: Agent | null;
    orders: Order[];
    /** Null when the finance API was not asked, because the console is on fixtures. */
    incentives: Incentive[] | null;
    /** D6: what this agent holds and has scanned. Null when the API is off. */
    grants: GrantView[] | null;
    scans: ScanView[] | null;
    /** D4: the desk's KYC record for this agent. Null when none exists, or the API is off. */
    kyc: AgentKycCase | null;
    /** D5: where they are paid. Null when the finance API is off. */
    methods: PayoutMethod[] | null;
    /** Every offer they have had, folded. Null when the API is off. */
    offers: AgentOffers | null;
    rating: AgentRating | null;
    /** DR 05: the rung and its history. Null when the API is off. */
    tier: TierView | null;
    /** DR 05: this week's board in the agent's city. Null with no city, the API off, or a failed read. */
    leaderboard: LeaderboardView | null;
    /** DR 05: the milestone board. Null when the API is off. */
    milestones: MilestoneBoard | null;
    /** LH10: the quality score off the sampled field work. Null when the leads API is off or the read failed. */
    quality: AgentQuality | null;
    /** Lot A: the sections stopped and the history. Null when the API is off or the read failed. */
    suspension: SuspensionView | null;
    /** CP-1: the pay terms in force and the ones before them. Null when the API is off or the read failed. */
    compensation: AgentCompensationHistory | null;
    /** CP-1: today's quota and this month's real cost per onboarding. Null when the API is off or the read failed. */
    standing: AgentStanding | null;
}

/**
 * One agent, their orders, and what ops has recorded for them.
 *
 * Orders are `GET /orders?agentId=`, newest first, up to the list's page of a
 * hundred (OM-2). They used to be the platform's first hundred orders
 * filtered here by agent id, which lost an agent's rows once the platform
 * passed a hundred orders. The orders screen remains the full record.
 *
 * Incentives are `GET /finance/incentives?agentId=`, the one per-agent money
 * figure the API has. It is a finance endpoint with no fixture at all, so it
 * is only asked for when the API is on, and the tab says so otherwise. It is
 * not "earnings this month" — that aggregate exists nowhere, which is why the
 * tile the wireframe drew for it is gone rather than filled with a zero.
 */
export function AgentLoader({ id }: { id: string }) {
    const live = isLive("agents");

    const resource = useApiResource<Loaded>(`agent:${id}:${live}`, async () => {
        const agent = await agentService.get(id);
        if (!agent) {
            return {
                agent: null,
                orders: [],
                incentives: null,
                grants: null,
                scans: null,
                kyc: null,
                methods: null,
                offers: null,
                rating: null,
                tier: null,
                leaderboard: null,
                milestones: null,
                quality: null,
                suspension: null,
                compensation: null,
                standing: null,
            };
        }

        const [orders, incentives, grants, scans, kyc, methods, offers, rating, tier, leaderboard, milestones, quality, suspension, compensation, standing] = await Promise.all([
            /* OM-2: the agent's own orders, by id, newest first. This used to be
               the first hundred on the platform filtered here, which lost an
               agent's rows past a hundred orders. */
            orderService.page({ agentId: agent.id, pageSize: 100 }).then((page) => page.items),
            financeReadsApi()
                ? financeService.incentives({ agentId: agent.id })
                : Promise.resolve<Incentive[] | null>(null),
            isLive("access") ? accessService.forAgent(agent.id) : Promise.resolve<GrantView[] | null>(null),
            isLive("access") ? accessService.scansBy(agent.userId) : Promise.resolve<ScanView[] | null>(null),
            agentKycService.get(agent.id),
            financeReadsApi()
                ? financeService.payoutMethodsFor(agent.userId)
                : Promise.resolve<PayoutMethod[] | null>(null),
            live ? agentService.offers(agent.id).catch(() => null) : Promise.resolve<AgentOffers | null>(null),
            live ? agentService.rating(agent.id).catch(() => null) : Promise.resolve<AgentRating | null>(null),
            live ? agentService.tier(agent.id).catch(() => null) : Promise.resolve<TierView | null>(null),
            /* The rank is this week's in the agent's own city; without a city
               there is no cohort, so the call is skipped rather than made with
               a blank the endpoint would refuse. */
            isLive("growth") && agent.city
                ? growthService.leaderboard(agent.city, "WEEK").catch(() => null)
                : Promise.resolve<LeaderboardView | null>(null),
            live ? agentService.milestones(agent.id).catch(() => null) : Promise.resolve<MilestoneBoard | null>(null),
            /* LH10: the quality score, off the leads domain — a failed read
               (no sampled work yet, the domain off) leaves the card saying so. */
            isLive('leads') ? integrityService.quality(agent.id).catch(() => null) : Promise.resolve<AgentQuality | null>(null),
            /* Lot A: the case beside the row, because the card draws its
               history. A failed read leaves the card saying so. */
            isLive("suspension")
                ? suspensionService.history("AGENT", agent.id).catch(() => null)
                : Promise.resolve<SuspensionView | null>(null),
            /* CP-1: the salary and the quota it covers, and where the agent
               stands against it today. Both are ADMIN reads on a live server
               only; a failure leaves the card saying the terms could not be
               read rather than implying there are none. */
            live ? compensationService.get(agent.id).catch(() => null) : Promise.resolve<AgentCompensationHistory | null>(null),
            live ? compensationService.standing(agent.id).catch(() => null) : Promise.resolve<AgentStanding | null>(null),
        ]);

        return {
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
            compensation,
            standing,
        };
    });

    return (
        <ResourceBoundary resource={resource}>
            {(data) => {
                if (!data.agent) notFound();
                return (
                    <AgentDetail
                        agent={data.agent}
                        orders={data.orders}
                        incentives={data.incentives}
                        grants={data.grants}
                        scans={data.scans}
                        kyc={data.kyc}
                        methods={data.methods}
                        offers={data.offers}
                        rating={data.rating}
                        tier={data.tier}
                        leaderboard={data.leaderboard}
                        milestones={data.milestones}
                        quality={data.quality}
                        suspension={data.suspension}
                        compensation={data.compensation}
                        standing={data.standing}
                        onChanged={resource.reload}
                    />
                );
            }}
        </ResourceBoundary>
    );
}
