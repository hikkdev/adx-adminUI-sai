"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { standingLine, type AgentCompensation, type AgentCompensationHistory, type AgentStanding } from "@/services/agents";
import { SetCompensationDialog } from "./set-compensation-dialog";

interface AgentCompensationCardProps {
    agentId: string;
    agentName: string;
    /** The desk-set grade, so a first set starts from that grade's defaults. */
    grade: string | null;
    /** The terms in force and the ones before them. Null when the agents API is off or the read failed. */
    compensation: AgentCompensationHistory | null;
    /** Today's quota and this month's real unit cost. Null when the API is off or the read failed. */
    standing: AgentStanding | null;
    onChanged?: () => void;
}

/** "₹12,000.00 a month · 10 a day over 26 days · 10% on top" — a past record in one line. */
export function pastTermsLine(terms: Pick<AgentCompensation, "monthlySalary" | "dailyQuota" | "workingDaysPerMonth" | "commissionUpliftPct">): string {
    return `${formatMoney(terms.monthlySalary)} a month · ${terms.dailyQuota} a day over ${terms.workingDaysPerMonth} days · ${formatPct(terms.commissionUpliftPct)} on top`;
}

/**
 * CP-1: what this agent is paid, what a day of it covers, and what an
 * onboarding actually cost.
 *
 * The headline is the month's **real** cost per onboarding — the salary
 * spread over what was done, not the planned figure the commission is priced
 * from — because that is the number to read before coaching or re-grading
 * anyone. The terms themselves sit below it in plain words, then the records
 * they replaced, greyed, with the dates each was in force.
 *
 * Commission, lead rewards and milestone bonuses are on the Payouts and
 * Milestones tabs; this card is the salary side and the quota that prices it.
 */
export function AgentCompensationCard({ agentId, agentName, grade, compensation, standing, onChanged }: AgentCompensationCardProps) {
    const { can } = useAuth();
    const [editing, setEditing] = React.useState(false);
    const current = compensation?.current ?? null;
    const past = (compensation?.history ?? []).filter((row) => row.id !== current?.id);
    /* Recording pay is a money term: `POST /agents/:id/compensation` asks for finance.edit. */
    const mayEdit = compensation !== null && can("finance.edit");

    return (
        <Card className="rounded-lg border-border p-5 shadow-none" data-testid="agent-compensation-card">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-base font-semibold text-foreground">Compensation</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        The salary covers a set number of onboardings a day. Past that, each onboarding pays extra.
                    </p>
                </div>
                {mayEdit && (
                    <Button variant="outline" size="sm" className="shrink-0 bg-card" onClick={() => setEditing(true)}>
                        {current ? "Change pay" : "Set compensation"}
                    </Button>
                )}
            </div>

            {compensation === null ? (
                <p className="mt-4 text-sm text-muted-foreground" data-testid="agent-comp-offline">
                    Pay could not be read right now, so it cannot be shown or set here.
                </p>
            ) : current === null ? (
                <div className="mt-4 space-y-2" data-testid="agent-comp-none">
                    <p className="text-sm text-muted-foreground">
                        {agentName} has no salary on record, so each onboarding pays the flat rate from Finance › Settings. Setting their pay
                        puts them on a salary and a daily quota instead.
                    </p>
                    {standing && standing.doneThisMonth > 0 && (
                        <p className="text-sm text-foreground" data-testid="agent-comp-unpriced">
                            <span className="tabular-nums">{standing.doneThisMonth}</span> onboarded this month, with no salary to set them
                            against.
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <p className="text-metric mt-4 text-foreground" data-testid="agent-cost-per-onboarding">
                        {standing?.salaryPerOnboarding ? formatMoney(standing.salaryPerOnboarding) : "—"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {standing?.salaryPerOnboarding
                            ? `What an onboarding actually cost this month — ${formatMoney(current.monthlySalary)} over ${standing.doneThisMonth} onboarded.`
                            : "What an onboarding actually cost this month. Nothing onboarded yet, so there is nothing to divide by."}
                    </p>
                    {standing && (
                        <p className="mt-3 text-sm text-foreground" data-testid="agent-standing-line">
                            {standingLine(standing)}
                        </p>
                    )}

                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm" data-testid="agent-comp-terms">
                        <Term label="Monthly salary" value={formatMoney(current.monthlySalary)} />
                        <Term label="Daily quota" value={`${current.dailyQuota} onboardings`} />
                        <Term label="Working days a month" value={String(current.workingDaysPerMonth)} />
                        <Term label="Commission on extra onboardings" value={`${formatPct(current.commissionUpliftPct)} on top`} />
                        <Term
                            label="Planned cost per onboarding"
                            value={current.plannedUnitCost ? formatMoney(current.plannedUnitCost) : "—"}
                        />
                        <Term
                            label="Pay for each extra onboarding"
                            value={current.commissionPerExtra ? formatMoney(current.commissionPerExtra) : "—"}
                        />
                    </dl>

                    <p className="mt-3 text-xs text-muted-foreground" data-testid="agent-comp-in-force">
                        In force from {formatDate(current.effectiveFrom)}
                        {current.note ? ` · ${current.note}` : ""}
                    </p>
                </>
            )}

            {compensation !== null && past.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground">Earlier pay</p>
                    <ul className="mt-2 space-y-1.5 text-muted-foreground" data-testid="agent-comp-history">
                        {past.map((row) => (
                            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                                <span>{pastTermsLine(row)}</span>
                                <span className="tabular-nums">
                                    {formatDate(row.effectiveFrom)} – {row.effectiveTo ? formatDate(row.effectiveTo) : "now"}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <SetCompensationDialog
                agentId={agentId}
                agentName={agentName}
                grade={grade}
                current={current}
                open={editing}
                onOpenChange={setEditing}
                onSaved={() => onChanged?.()}
            />
        </Card>
    );
}

function Term({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular-nums text-foreground">{value}</dd>
        </div>
    );
}
