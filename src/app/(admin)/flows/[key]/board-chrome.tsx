"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronLeft, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AGENT_JOB_FLOW_KEY, AUDIENCE_MAX, EMPLOYEE_INTAKE_FLOW_KEY, LISTING_FLOW_KEY, ONBOARDING_FLOW_KEY, type FlowIssue } from "@/services/flows";

/**
 * What the boards share: the back link, the editable label, the editable
 * description under it (Lot G, Q126 — the sentence the flow list prints
 * under the key), the editable audience (G13-B — who the flow is for, the
 * card's audience line), the version, the save button, the "phones read
 * this" banner and the list of what the server refused.
 */
export function BoardHeader({
    flowKey,
    label,
    description,
    audience,
    version,
    stored = true,
    dirty,
    busy,
    onLabel,
    onDescription,
    onAudience,
    onSave,
}: {
    flowKey: string;
    label: string;
    /** The flow's `description`; "" while it has none. */
    description: string;
    /** G13-B: the flow's `audience`; "" while it has none. */
    audience: string;
    version: number | undefined;
    /** False for a known key the row does not hold yet — the board started from the code's ladder. */
    stored?: boolean;
    dirty: boolean;
    busy: boolean;
    onLabel: (label: string) => void;
    onDescription: (description: string) => void;
    onAudience: (audience: string) => void;
    onSave: () => void;
}) {
    return (
        <div>
            <Link
                href="/flows"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ChevronLeft className="size-4" />
                Flow Editor
            </Link>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <Input
                        value={label}
                        onChange={(event) => onLabel(event.target.value)}
                        aria-label="Flow label"
                        className="h-auto max-w-md border-transparent px-0 text-2xl font-semibold tracking-tight shadow-none hover:border-border focus-visible:border-border"
                    />
                    <Input
                        value={description}
                        onChange={(event) => onDescription(event.target.value)}
                        aria-label="Flow description"
                        placeholder="What this flow is for, in a sentence — printed under the key on the flow list."
                        maxLength={500}
                        className="mt-1 h-auto w-full max-w-2xl border-transparent px-0 text-sm text-muted-foreground shadow-none hover:border-border focus-visible:border-border"
                    />
                    <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
                        <span>
                            <code>{flowKey}</code> · {stored ? `version ${version ?? 1}` : "not stored yet — the code's ladder, until the first save"}
                            {dirty ? " · unsaved changes" : ""}
                        </span>
                        <span aria-hidden>·</span>
                        <label className="inline-flex items-center gap-1">
                            <span>For</span>
                            <Input
                                value={audience}
                                onChange={(event) => onAudience(event.target.value)}
                                aria-label="Flow audience"
                                placeholder="who this flow is for"
                                maxLength={AUDIENCE_MAX}
                                className="h-auto w-48 border-transparent px-1 py-0 text-sm text-muted-foreground shadow-none hover:border-border focus-visible:border-border"
                            />
                        </label>
                    </div>
                </div>
                <Button onClick={onSave} disabled={!dirty || busy}>
                    {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
                </Button>
            </div>
        </div>
    );
}

/** Which app reads this key on boot, and what a save therefore does. */
export function LiveBanner({ flowKey }: { flowKey: string }) {
    const line =
        flowKey === LISTING_FLOW_KEY
            ? "Both apps read this flow on boot and after every config refresh. A save here is what the next publisher adding a spot is asked, on their phone, tonight."
            : flowKey === ONBOARDING_FLOW_KEY
              ? "Both apps compose their onboarding ladder from this template. A save here changes what the next publisher or advertiser is asked to prove before ADX verifies them; a party mid-ladder keeps the version they started on."
              : flowKey === AGENT_JOB_FLOW_KEY
                ? "The agent app climbs this checklist on every job, and the order's submit gate waits for the proofs it names. A save here changes what the next agent is asked to photograph before a job can be submitted; a step's copy can move, but a proof the code checks cannot be dropped."
                : flowKey === EMPLOYEE_INTAKE_FLOW_KEY
                  ? "The KYC desk climbs this ladder on an employee's behalf, and the case's intake progress is read off it. A save here changes which documents the desk asks for and in what order; the four the code requires stay."
                  : "A wizard under a new key is stored and versioned like the listing flow, but neither app renders it until its code names the key.";
    return (
        <Card className="flex items-start gap-3 rounded-lg border-warning/40 bg-warning-soft p-4 shadow-none">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <p className="text-sm text-foreground">{line}</p>
        </Card>
    );
}

/** One refusal marked on the board, with the way back to it. */
export interface MarkedIssue {
    pointer: string;
    message: string;
    show: () => void;
}

/**
 * The server's refusals that point at nothing on the board — a 409, the
 * flow's label, a flatten from a server one release behind — line by line
 * with the key each landed under; and, when others were marked on the
 * board itself, one line each with a way to jump to it.
 */
export function IssueList({ issues, marked = [], onDismiss }: { issues: FlowIssue[]; marked?: MarkedIssue[]; onDismiss: () => void }) {
    if (issues.length === 0 && marked.length === 0) return null;
    return (
        <Card className="rounded-lg border-danger/40 bg-danger-soft p-4 shadow-none">
            <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">The server did not store this flow</p>
                    {issues.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {issues.map((issue, index) => (
                                <li key={`${issue.where}-${index}`}>
                                    <code className="mr-1.5 rounded bg-muted px-1 py-0.5 text-[11px]">{issue.pointer ?? issue.where}</code>
                                    {issue.message}
                                </li>
                            ))}
                        </ul>
                    )}
                    {marked.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {marked.map((issue, index) => (
                                <li key={`${issue.pointer}-${index}`} className="flex flex-wrap items-center gap-1.5">
                                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{issue.pointer}</code>
                                    <span className="min-w-0 flex-1 truncate">{issue.message}</span>
                                    <button type="button" onClick={issue.show} className="text-xs font-medium text-primary hover:underline">
                                        Show on the board
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Button size="sm" variant="outline" className="mt-3 bg-card" onClick={onDismiss}>
                        Dismiss
                    </Button>
                </div>
            </div>
        </Card>
    );
}

/** The server's message beside the control it refused. */
export function IssueNote({ message, pointer, className }: { message: string; pointer?: string; className?: string }) {
    return (
        <p className={cn("flex items-start gap-1.5 text-xs text-danger", className)} role="alert">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
                {pointer && <code className="mr-1 rounded bg-danger/10 px-1 py-0.5 text-[10px]">{pointer}</code>}
                {message}
            </span>
        </p>
    );
}

/**
 * Scrolls the board to a `data-issue-anchor` after the render that draws
 * it. The anchor is a string state so the effect runs once per jump, and
 * a nonce rides along so the same anchor can be jumped to twice.
 */
export function useIssueJump(): (anchor: string) => void {
    const [jump, setJump] = React.useState<{ anchor: string; nonce: number } | null>(null);
    React.useEffect(() => {
        if (!jump) return;
        const element = document.querySelector<HTMLElement>(`[data-issue-anchor="${CSS.escape(jump.anchor)}"]`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [jump]);
    return (anchor: string) => setJump((current) => ({ anchor, nonce: (current?.nonce ?? 0) + 1 }));
}
