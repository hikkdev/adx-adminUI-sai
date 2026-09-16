"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { StatusBadge } from "@/components/adx/status-badge";
import {
    EMPLOYEE_KYC_SLOTS,
    EMPLOYEE_KYC_STATUS_META,
    employeeKycService,
    type EmployeeKycCase,
    type EmployeeKycDocuments,
    type EmployeeKycSlot,
    type EmployeeSummary,
} from "@/services/employee-kyc";
import { DocumentSlot } from "../../agents/[agentId]/document-slot";

interface EmployeeKycRecordProps {
    employee: EmployeeSummary;
    kyc: EmployeeKycCase | null;
    live: boolean;
    onChanged: () => void;
}

const GOV_ID_TYPES = [
    { value: "AADHAAR", label: "Aadhaar" },
    { value: "PASSPORT", label: "Passport" },
    { value: "DRIVING_LICENCE", label: "Driving licence" },
] as const;

const ADDRESS_PROOF_TYPES = [
    { value: "UTILITY_BILL", label: "Utility bill" },
    { value: "RENT_AGREEMENT", label: "Rent agreement" },
    { value: "BANK_STATEMENT", label: "Bank statement" },
] as const;

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * One employee's KYC, recorded on their behalf and then decided — Lot D
 * (Q131), the agent record's twin.
 *
 * The top half is the desk's form: what the employee showed, uploaded slot
 * by slot under the private EMPLOYEE_KYC purpose, saved with
 * `PUT /employee-kyc/:employeeId` — an upsert, so HR can record what they
 * have and come back for the rest. The bottom half is the decision, the
 * same shape as every other KYC review: verify, or reject with a reason.
 */
export function EmployeeKycRecord({ employee, kyc, live, onChanged }: EmployeeKycRecordProps) {
    const [form, setForm] = React.useState<EmployeeKycDocuments>(kyc?.recorded ?? {});
    const [saving, setSaving] = React.useState(false);
    const [reason, setReason] = React.useState("");
    const [confirmAction, setConfirmAction] = React.useState<"verify" | "reject" | null>(null);
    const [deciding, setDeciding] = React.useState(false);

    const set = <K extends keyof EmployeeKycDocuments>(key: K, value: EmployeeKycDocuments[K]) =>
        setForm((current) => ({ ...current, [key]: value }));

    const panInvalid = Boolean(form.panNumber) && !PAN_PATTERN.test(form.panNumber ?? "");
    const recorded = EMPLOYEE_KYC_SLOTS.filter((slot) => Boolean(form[slot.key])).length;
    const name = employee.name;

    const save = async () => {
        if (panInvalid) {
            toast.error("PAN is five letters, four digits and a letter — ABCDE1234F.");
            return;
        }
        setSaving(true);
        try {
            await employeeKycService.record(employee.id, form);
            toast.success(`${name}'s documents recorded`, {
                description: `${recorded} of ${EMPLOYEE_KYC_SLOTS.length} on file · awaiting review`,
            });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The record did not reach ADX.");
        } finally {
            setSaving(false);
        }
    };

    const decide = async (action: "verify" | "reject") => {
        setDeciding(true);
        try {
            await employeeKycService.review(employee.id, action === "verify" ? "VERIFIED" : "REJECTED", reason.trim() || undefined);
            toast.success(action === "verify" ? `${name} verified` : `${name}'s KYC rejected`, {
                description: reason.trim() ? `Reason recorded: “${reason.trim()}”` : undefined,
            });
            setReason("");
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The decision did not reach ADX.");
        } finally {
            setDeciding(false);
        }
    };

    return (
        <div className="space-y-5">
            <div>
                <Link href="/kyc/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    Employee KYC
                </Link>
                <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Employee KYC record</p>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{name}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {[employee.displayId, employee.department, employee.designation, employee.mobile].filter(Boolean).join(" · ")}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {kyc ? (
                            <>
                                <StatusBadge status={EMPLOYEE_KYC_STATUS_META[kyc.status]} />
                                {/* E7-3: hours waiting while PENDING, against the SLA the read named. */}
                                {kyc.ageHours !== null && (
                                    <StatusBadge
                                        status={
                                            kyc.slaBreached
                                                ? { label: `Waiting ${Math.floor(kyc.ageHours)}h · past SLA`, tone: "danger" }
                                                : { label: `Waiting ${Math.floor(kyc.ageHours)}h${kyc.slaHours ? ` of ${kyc.slaHours}h` : ""}`, tone: "neutral" }
                                        }
                                    />
                                )}
                            </>
                        ) : (
                            <StatusBadge status={{ label: "Nothing recorded yet", tone: "neutral" }} />
                        )}
                    </div>
                </div>
            </div>

            {!live && (
                <Card className="rounded-lg border-border p-5 shadow-none">
                    <p className="text-sm text-muted-foreground">
                        Employee KYC is written to the API and has no fixtures. Turn the KYC domain on to record documents.
                    </p>
                </Card>
            )}

            <div className="grid gap-4 xl:grid-cols-5">
                <Card className="rounded-lg border-border p-5 shadow-none xl:col-span-3">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What the employee showed</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Recorded on their behalf by whoever is signed in. Save what you have; the rest can follow.
                            </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                            {recorded} of {EMPLOYEE_KYC_SLOTS.length}
                        </span>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="gov-id-type">Government ID</Label>
                            <Select value={form.govIdType ?? ""} onValueChange={(value) => set("govIdType", value as EmployeeKycDocuments["govIdType"])} disabled={!live || saving}>
                                <SelectTrigger id="gov-id-type">
                                    <SelectValue placeholder="Choose a type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {GOV_ID_TYPES.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="pan-number">PAN</Label>
                            <Input
                                id="pan-number"
                                value={form.panNumber ?? ""}
                                onChange={(event) => set("panNumber", event.target.value.toUpperCase())}
                                placeholder="ABCDE1234F"
                                maxLength={10}
                                className="font-mono uppercase"
                                aria-invalid={panInvalid || undefined}
                                disabled={!live || saving}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="address-proof-type">Address proof</Label>
                            <Select
                                value={form.addressProofType ?? ""}
                                onValueChange={(value) => set("addressProofType", value as EmployeeKycDocuments["addressProofType"])}
                                disabled={!live || saving}
                            >
                                <SelectTrigger id="address-proof-type">
                                    <SelectValue placeholder="Choose a type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ADDRESS_PROOF_TYPES.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="mt-4 divide-y border-t">
                        {EMPLOYEE_KYC_SLOTS.map((slot) => (
                            <DocumentSlot
                                key={slot.key}
                                label={slot.label}
                                url={form[slot.key as EmployeeKycSlot]}
                                onChange={(url) => set(slot.key, url)}
                                disabled={!live || saving}
                                purpose="EMPLOYEE_KYC"
                            />
                        ))}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
                        <Button onClick={() => void save()} disabled={!live || saving || panInvalid}>
                            {kyc ? "Save changes" : "Save record"}
                        </Button>
                    </div>
                </Card>

                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision</h3>
                        {kyc ? (
                            <dl className="mt-3 space-y-2 text-sm">
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Status</dt>
                                    <dd>
                                        <StatusBadge status={EMPLOYEE_KYC_STATUS_META[kyc.status]} />
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <dt className="text-muted-foreground">Recorded</dt>
                                    <dd className="font-medium text-foreground">{kyc.submittedAt}</dd>
                                </div>
                                {kyc.recordedBy && (
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-muted-foreground">Recorded by</dt>
                                        <dd className="truncate font-medium text-foreground">{kyc.recordedBy.name?.trim() || kyc.recordedBy.id}</dd>
                                    </div>
                                )}
                                {kyc.reviewedAt && (
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-muted-foreground">Decided</dt>
                                        <dd className="font-medium text-foreground">
                                            {kyc.reviewedAt}
                                            {kyc.reviewedBy ? ` · by ${kyc.reviewedBy.name?.trim() || kyc.reviewedBy.id}` : ""}
                                        </dd>
                                    </div>
                                )}
                                {kyc.rejectionReason && <div className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{kyc.rejectionReason}</div>}
                            </dl>
                        ) : (
                            <p className="mt-3 text-sm text-muted-foreground">Save the record first; the decision follows what was recorded.</p>
                        )}

                        <Textarea
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Reason — required for a rejection; the employee reads it back…"
                            className="mt-4 min-h-20 resize-none"
                            disabled={!live || !kyc || deciding}
                        />
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <Button variant="outline" className="bg-card text-danger hover:text-danger" onClick={() => setConfirmAction("reject")} disabled={!live || !kyc || deciding}>
                                Reject
                            </Button>
                            <Button onClick={() => setConfirmAction("verify")} disabled={!live || !kyc || deciding}>
                                Verify
                            </Button>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why the desk</h3>
                        <p className="mt-3 text-sm text-muted-foreground">
                            Staff are onboarded through the intake form and only ever sign in — nothing lets them submit their own papers. The
                            record remembers who at ADX recorded it, and the bank proof is what payroll needs.
                        </p>
                    </Card>
                </div>
            </div>

            <ConfirmDialog
                open={confirmAction !== null}
                onOpenChange={(open) => !open && setConfirmAction(null)}
                title={confirmAction === "verify" ? "Verify this employee?" : "Reject this employee's KYC?"}
                description={
                    confirmAction === "verify"
                        ? `${name} will be marked verified against the ${recorded} document${recorded === 1 ? "" : "s"} on file.`
                        : `${name} will see your reason. The desk can record fresh documents afterwards.`
                }
                confirmLabel={confirmAction === "verify" ? "Verify" : "Reject"}
                destructive={confirmAction === "reject"}
                busy={deciding}
                onConfirm={() => {
                    if (confirmAction === "reject" && reason.trim().length === 0) {
                        toast.error("Say why before rejecting — the employee reads the reason.");
                        setConfirmAction(null);
                        return;
                    }
                    const action = confirmAction!;
                    setConfirmAction(null);
                    void decide(action);
                }}
            />
        </div>
    );
}
