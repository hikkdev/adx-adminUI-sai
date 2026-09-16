"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AgentSearchPicker } from "@/components/adx/agent-search-picker";
import type { AgentSummary } from "@/services/agents";
import { OPS_OVERRIDE_AUDIT_ACTION, orderService, type OpsOverride } from "@/services/orders";
import type { Order } from "@/types";

/**
 * Lot D (Q51/Q90): the four ops moves on an order, each with the mandatory
 * reason that goes on the audit row. The dialogs name the row they write so
 * whoever reads the trail later finds it under the same words.
 */

/** The backend's bound on every ops reason. */
export const OPS_REASON_MIN = 3;
export const OPS_REASON_MAX = 500;

const reasonOk = (text: string) => text.trim().length >= OPS_REASON_MIN && text.trim().length <= OPS_REASON_MAX;

interface DoneProps {
    order: Order;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDone?: () => void;
}

/* ------------------------------------------------------------------ */
/* Reassign agent                                                      */
/* ------------------------------------------------------------------ */

export function ReassignAgentDialog({ order, open, onOpenChange, onDone }: DoneProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <ReassignForm order={order} onClose={() => onOpenChange(false)} onDone={onDone} />}
            </DialogContent>
        </Dialog>
    );
}

function ReassignForm({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone?: () => void }) {
    const [agent, setAgent] = React.useState<AgentSummary | null>(null);
    const [reason, setReason] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const ready = !!agent && reasonOk(reason);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy || !agent) return;
        setBusy(true);
        setError(null);
        try {
            await orderService.reassignAgent(order.id, agent.id, reason.trim());
            toast.success("Order reassigned", {
                description: `A fresh 25-minute offer is with ${agent.user?.name ?? agent.id}; ${
                    order.agent ?? "the previous agent"
                } has been told. Recorded as ORDER_AGENT_REASSIGNED.`,
            });
            onDone?.();
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not reassign the order.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Reassign agent</DialogTitle>
                <DialogDescription>
                    {order.agent
                        ? `${order.agent}'s offer closes as reassigned — not a refusal, so no strike and no priority hit — and the order goes back to Pending agent with the slot cleared.`
                        : "The order goes to the agent named here as a fresh 25-minute offer."}
                </DialogDescription>
            </DialogHeader>

            <AgentSearchPicker
                id="reassign-agent"
                label="New agent"
                value={agent}
                onChange={setAgent}
                excludeId={order.agentId}
            />

            <ReasonField
                id="reassign-reason"
                value={reason}
                onChange={setReason}
                hint="Required. Goes on the ORDER_AGENT_REASSIGNED audit row with both agents."
                placeholder="Agent not answering calls since the slot was proposed."
            />

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Reassigning…" : "Reassign"}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* The three overrides                                                 */
/* ------------------------------------------------------------------ */

/** What each override says about itself: the title, what happens, and how the trail names it. */
export const OPS_OVERRIDE_COPY: Record<
    OpsOverride,
    { title: string; description: string; confirm: string; success: string }
> = {
    ACCEPT_PUBLISHER: {
        title: "Accept for the publisher",
        description:
            "The 30-minute window has passed and the publisher has said yes out of band — on the phone, at the door. The order moves to Pending print exactly as if they had tapped, and every party hears the same notification.",
        confirm: "Accept for publisher",
        success: "Accepted for the publisher",
    },
    CONFIRM_SLOT: {
        title: "Confirm the slot for the publisher",
        description:
            "The agent proposed a time and the publisher has said nothing for 24 hours. The slot is confirmed as if the publisher had, and the spot is marked occupied.",
        confirm: "Confirm slot",
        success: "Slot confirmed for the publisher",
    },
    COLLECT_PRINTS: {
        title: "Record the prints as collected",
        description:
            "The agent's check-in says they are at the site and the collect-prints tap did not land. Recorded for them; the order moves to In progress.",
        confirm: "Record collection",
        success: "Prints recorded as collected",
    },
};

export function OpsOverrideDialog({
    order,
    step,
    open,
    onOpenChange,
    onDone,
}: DoneProps & { step: OpsOverride }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                {open && <OverrideForm order={order} step={step} onClose={() => onOpenChange(false)} onDone={onDone} />}
            </DialogContent>
        </Dialog>
    );
}

function OverrideForm({
    order,
    step,
    onClose,
    onDone,
}: {
    order: Order;
    step: OpsOverride;
    onClose: () => void;
    onDone?: () => void;
}) {
    const copy = OPS_OVERRIDE_COPY[step];
    const [reason, setReason] = React.useState("");
    const [consentNote, setConsentNote] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const needsConsent = step === "ACCEPT_PUBLISHER";
    const ready = reasonOk(reason) && (!needsConsent || consentNote.trim().length >= 3);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!ready || busy) return;
        setBusy(true);
        setError(null);
        try {
            const text = reason.trim();
            if (step === "ACCEPT_PUBLISHER") {
                await orderService.opsAcceptPublisher(order.id, { reason: text, consentNote: consentNote.trim() });
            } else if (step === "CONFIRM_SLOT") {
                await orderService.opsConfirmSlot(order.id, text);
            } else {
                await orderService.opsCollectPrints(order.id, text);
            }
            toast.success(copy.success, {
                description: `Recorded as ${OPS_OVERRIDE_AUDIT_ACTION} · ${step} with your name and the reason.`,
            });
            onDone?.();
            onClose();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{copy.title}</DialogTitle>
                <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>

            {needsConsent && (
                <div className="grid gap-1.5">
                    <Label htmlFor="ops-consent">How the publisher agreed</Label>
                    <Textarea
                        id="ops-consent"
                        value={consentNote}
                        onChange={(event) => setConsentNote(event.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="Confirmed by phone with the owner at 11:20; agreed to the flight dates."
                    />
                    <p className="text-xs text-muted-foreground">
                        Required. The consent note rides on the audit row, not the order.
                    </p>
                </div>
            )}

            <ReasonField
                id="ops-reason"
                value={reason}
                onChange={setReason}
                hint={`Required. Written on the ${OPS_OVERRIDE_AUDIT_ACTION} audit row as step ${step}, so the trail lists every time ADX acted for somebody.`}
                placeholder={
                    step === "COLLECT_PRINTS"
                        ? "Agent on site; app could not reach ADX to record collection."
                        : "Publisher unreachable in the app; confirmed by phone."
                }
            />

            {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

            <DialogFooter>
                <Button type="button" variant="outline" className="bg-card" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!ready || busy}>
                    {busy ? "Working…" : copy.confirm}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ------------------------------------------------------------------ */
/* The reason field every move shares                                  */
/* ------------------------------------------------------------------ */

export function ReasonField({
    id,
    value,
    onChange,
    hint,
    placeholder,
    label = "Reason",
}: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    hint: string;
    placeholder?: string;
    label?: string;
}) {
    return (
        <div className="grid gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Textarea
                id={id}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={3}
                maxLength={OPS_REASON_MAX}
                placeholder={placeholder}
            />
            <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}
