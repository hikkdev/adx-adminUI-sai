/**
 * Data access layer.
 *
 * Every page reads through these functions rather than importing mock data
 * directly, so swapping in a real API later is a change to this module only.
 */
import {
    advertisers,
    agents,
    getAdvertiser,
    getAgent,
    getPublisher,
    publishers,
} from "@/data/directory";
import {
    bookings,
    campaigns,
    getCampaign,
    getListing,
    getOrder,
    listings,
    orders,
} from "@/data/marketplace";
import {
    disputes,
    disputeSummary,
    getDispute,
    getKycCase,
    getPayoutBatch,
    getWithdrawal,
    invoices,
    kycCases,
    payoutBatches,
    withdrawals,
} from "@/data/finance";
import {
    adminUsers,
    auditEvents,
    capabilityGroups,
    creatives,
    getMilestone,
    getTicket,
    milestones,
    pendingInvites,
    roleColumns,
    tickets,
} from "@/data/platform";
import {
    agencyFlow,
    aspectFactors,
    categoriesAboveCard,
    categoryControls,
    categoryRules,
    commissionTiers,
    discountDrivers,
    illuminationMultipliers,
    priceApprovals,
    pricingKpis,
    rateCardSettings,
    rateCards,
    rateMatrix,
    rateRealisation,
    revenueCategoryOverrides,
    revenueSplit,
    rulesFiringMost,
    sampleRule,
    simulatorDefaults,
    simulatorSteps,
    sizeBands,
    slaPenalties,
    sqftSlabs,
    surgeDetail,
    surgeWeeks,
    surgeWindows,
    workedExample,
} from "@/data/pricing";
import {
    buildTracking,
    scheduleEntries,
    scheduleLog,
    taskIssues,
    TASK_PROJECTS,
    workspacePeople,
    workTasks,
} from "@/data/workspace";
import {
    attendance,
    candidates,
    departments,
    employees,
    holidays,
    hrOverview,
    jobOpenings,
    leaveRequests,
    payroll,
} from "@/data/hr";
import { fulfilmentPlans, fulfilmentTemplates, onboardingFlows } from "@/data/flows";

const simulate = <T>(value: T): Promise<T> => Promise.resolve(value);

export const api = {
    publishers: {
        list: () => simulate(publishers),
        get: (id: string) => simulate(getPublisher(id)),
    },
    advertisers: {
        list: () => simulate(advertisers),
        get: (id: string) => simulate(getAdvertiser(id)),
    },
    agents: {
        list: () => simulate(agents),
        get: (id: string) => simulate(getAgent(id)),
    },
    listings: {
        list: () => simulate(listings),
        get: (id: string) => simulate(getListing(id)),
    },
    campaigns: {
        list: () => simulate(campaigns),
        get: (id: string) => simulate(getCampaign(id)),
    },
    orders: {
        list: () => simulate(orders),
        get: (id: string) => simulate(getOrder(id)),
    },
    bookings: {
        list: () => simulate(bookings),
    },
    kyc: {
        list: () => simulate(kycCases),
        get: (id: string) => simulate(getKycCase(id)),
    },
    finance: {
        withdrawals: () => simulate(withdrawals),
        withdrawal: (id: string) => simulate(getWithdrawal(id)),
        payoutBatches: () => simulate(payoutBatches),
        payoutBatch: (id: string) => simulate(getPayoutBatch(id)),
        invoices: () => simulate(invoices),
    },
    disputes: {
        list: () => simulate(disputes),
        get: (id: string) => simulate(getDispute(id)),
        summary: () => simulate(disputeSummary),
    },
    support: {
        tickets: () => simulate(tickets),
        ticket: (id: string) => simulate(getTicket(id)),
    },
    moderation: {
        creatives: () => simulate(creatives),
    },
    growth: {
        milestones: () => simulate(milestones),
        milestone: (id: string) => simulate(getMilestone(id)),
    },
    roles: {
        capabilityGroups: () => simulate(capabilityGroups),
        roleColumns: () => simulate(roleColumns),
    },
    adminUsers: {
        list: () => simulate(adminUsers),
        pendingInvites: () => simulate(pendingInvites),
    },
    audit: {
        list: () => simulate(auditEvents),
    },
    pricing: {
        overview: () =>
            simulate({
                kpis: pricingKpis,
                realisation: rateRealisation,
                discountDrivers,
                categoriesAboveCard,
                rulesFiringMost,
                approvals: priceApprovals,
            }),
        rateCards: () => simulate(rateCards),
        rateCardBuilder: () => simulate({ matrix: rateMatrix, settings: rateCardSettings }),
        dimensions: () =>
            simulate({ sizeBands, sqftSlabs, illuminationMultipliers, aspectFactors, workedExample }),
        categories: () => simulate({ rows: categoryRules, controls: categoryControls }),
        seasonality: () => simulate({ weeks: surgeWeeks, windows: surgeWindows, detail: surgeDetail }),
        revenueShare: () =>
            simulate({
                commissionTiers,
                categoryOverrides: revenueCategoryOverrides,
                agencyFlow,
                revenueSplit,
                slaPenalties,
            }),
        simulator: () => simulate({ defaults: simulatorDefaults, steps: simulatorSteps }),
        approvals: () => simulate(priceApprovals),
        rule: () => simulate(sampleRule),
    },
    tasks: {
        list: () => simulate(workTasks),
        get: (id: string) => simulate(workTasks.find((task) => task.id === id) ?? null),
        tracking: (id: string) => {
            const task = workTasks.find((item) => item.id === id);
            return simulate(task ? buildTracking(task) : null);
        },
        issues: () => simulate(taskIssues),
        projects: () => simulate(TASK_PROJECTS),
        people: () => simulate(workspacePeople),
    },
    schedule: {
        entries: () => simulate(scheduleEntries),
        log: () => simulate(scheduleLog),
    },
    hr: {
        overview: () => simulate(hrOverview),
        employees: () => simulate(employees),
        employee: (id: string) => simulate(employees.find((person) => person.id === id) ?? null),
        departments: () => simulate(departments),
        department: (slug: string) =>
            simulate(departments.find((dept) => dept.slug === slug) ?? null),
        attendance: () => simulate(attendance),
        leave: () => simulate(leaveRequests),
        holidays: () => simulate(holidays),
        payroll: () => simulate(payroll),
        jobs: () => simulate(jobOpenings),
        candidates: () => simulate(candidates),
    },
    flows: {
        list: () => simulate(onboardingFlows),
        get: (key: string) => simulate(onboardingFlows.find((flow) => flow.key === key) ?? null),
        templates: () => simulate(fulfilmentTemplates),
        plans: () => simulate(fulfilmentPlans),
    },
};
