"use client";

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "@/components/adx/section-card";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
    MONTHS,
    fieldMessagesOf,
    invoicesService,
    legalEntityPatchOf,
    type LegalEntity,
    type LegalEntityTextField,
} from "@/services/invoices";

interface LegalEntityCardProps {
    entity: LegalEntity;
    onChanged: () => void;
}

type Form = Record<LegalEntityTextField, string> & {
    invoicePrefix: string;
    financialYearStartMonth: string;
};

const formOf = (entity: LegalEntity): Form => ({
    legalName: entity.legalName ?? "",
    tradeName: entity.tradeName ?? "",
    gstin: entity.gstin ?? "",
    pan: entity.pan ?? "",
    tan: entity.tan ?? "",
    cin: entity.cin ?? "",
    registeredAddress: entity.registeredAddress ?? "",
    city: entity.city ?? "",
    stateCode: entity.stateCode ?? "",
    stateName: entity.stateName ?? "",
    invoicePrefix: entity.invoicePrefix,
    financialYearStartMonth: String(entity.financialYearStartMonth),
});

const FIELDS: { key: LegalEntityTextField; label: string; placeholder: string; span?: boolean; mono?: boolean }[] = [
    { key: "legalName", label: "Legal name", placeholder: "As on the certificate of incorporation" },
    { key: "tradeName", label: "Trade name", placeholder: "ADX" },
    { key: "gstin", label: "GSTIN", placeholder: "29ABCDE1234F1Z5", mono: true },
    { key: "pan", label: "PAN", placeholder: "ABCDE1234F", mono: true },
    { key: "tan", label: "TAN", placeholder: "BLRA12345B", mono: true },
    { key: "cin", label: "CIN", placeholder: "U12345KA2020PTC123456", mono: true },
    { key: "registeredAddress", label: "Registered address", placeholder: "Street, area, PIN", span: true },
    { key: "city", label: "City", placeholder: "Bengaluru" },
    { key: "stateCode", label: "State code", placeholder: "29", mono: true },
    { key: "stateName", label: "State", placeholder: "Karnataka" },
];

/**
 * ADX as the supplier on every invoice.
 *
 * Every document issued names this row as it stood at the time, so a change
 * here reaches the next invoice and no earlier one. The one field that
 * changes what the backend does is the GSTIN: while it is empty every
 * document is a proforma from the `-PRO` series and no tax number is
 * consumed. The state code and PAN are cross-checked against it server-side
 * and the message lands beside the field it names.
 *
 * Only what changed is sent. The schema is strict, and the audit diff should
 * say "GSTIN set", not "twelve fields written".
 */
export function LegalEntityCard({ entity, onChanged }: LegalEntityCardProps) {
    const [form, setForm] = React.useState<Form>(() => formOf(entity));
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState(false);

    // A reload after Save answers with the row as the server normalised it
    // (upper-cased, the state name filled from the code); the inputs follow.
    const [seenEntity, setSeenEntity] = React.useState(entity);
    if (seenEntity !== entity) {
        setSeenEntity(entity);
        setForm(formOf(entity));
        setErrors({});
    }

    const patch = legalEntityPatchOf(entity, form);
    const dirty = Object.keys(patch).length > 0;

    function set<K extends keyof Form>(key: K, value: string) {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => {
            if (!(key in current)) return current;
            const { [key]: _cleared, ...rest } = current;
            return rest;
        });
    }

    async function save() {
        if (!dirty) return;
        setBusy(true);
        try {
            await invoicesService.updateLegalEntity(patch);
            const changed = Object.keys(patch).length;
            toast.success("Legal entity saved", {
                description:
                    "gstin" in patch && patch.gstin
                        ? "Every invoice from here on is a tax invoice from the main series."
                        : `${changed} field${changed === 1 ? "" : "s"} updated. Documents already issued are unchanged.`,
            });
            onChanged();
        } catch (cause) {
            const fields = fieldMessagesOf(cause);
            setErrors(fields);
            const message = cause instanceof ApiError ? cause.message : "Could not save the legal entity.";
            toast.error(
                Object.keys(fields).length ? "Some fields were refused — see the form." : message
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <SectionCard
            title="Legal entity & tax"
            description="ADX as the supplier printed on every invoice. Changes reach the next document issued, never an earlier one."
            actions={
                <Button size="sm" disabled={!dirty || busy} onClick={save}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            }
        >
            <div className="space-y-4">
                {!entity.gstin && (
                    <Card className="rounded-lg border-warning/40 bg-warning-soft p-3 shadow-none">
                        <div className="flex items-start gap-2.5">
                            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                            <p className="text-xs text-foreground">
                                No GSTIN. Every invoice is being issued as a proforma from the{" "}
                                <code className="rounded bg-muted px-1 py-0.5">{entity.invoicePrefix}-PRO</code>{" "}
                                series, and no tax number is consumed. Set it here to start the tax
                                invoice series.
                            </p>
                        </div>
                    </Card>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                    {FIELDS.map((field) => (
                        <div key={field.key} className={cn("space-y-1.5", field.span && "sm:col-span-2")}>
                            <Label htmlFor={`entity-${field.key}`}>{field.label}</Label>
                            <Input
                                id={`entity-${field.key}`}
                                value={form[field.key]}
                                onChange={(event) => set(field.key, event.target.value)}
                                placeholder={field.placeholder}
                                autoCapitalize={field.mono ? "characters" : undefined}
                                className={cn(
                                    field.mono && "font-mono uppercase",
                                    errors[field.key] && "border-danger focus-visible:ring-danger"
                                )}
                                aria-invalid={errors[field.key] ? true : undefined}
                                aria-describedby={errors[field.key] ? `entity-${field.key}-error` : undefined}
                            />
                            {errors[field.key] && (
                                <p id={`entity-${field.key}-error`} className="text-xs text-danger">
                                    {errors[field.key]}
                                </p>
                            )}
                        </div>
                    ))}

                    <div className="space-y-1.5">
                        <Label htmlFor="entity-invoicePrefix">Invoice prefix</Label>
                        <Input
                            id="entity-invoicePrefix"
                            value={form.invoicePrefix}
                            onChange={(event) => set("invoicePrefix", event.target.value)}
                            placeholder="INV"
                            maxLength={8}
                            className={cn(
                                "font-mono uppercase",
                                errors.invoicePrefix && "border-danger focus-visible:ring-danger"
                            )}
                            aria-invalid={errors.invoicePrefix ? true : undefined}
                        />
                        {errors.invoicePrefix ? (
                            <p className="text-xs text-danger">{errors.invoicePrefix}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Numbers run {form.invoicePrefix.trim().toUpperCase() || "INV"}/2026-27/000001;
                                proformas add -PRO, credit notes -CN.
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="entity-fy">Financial year starts</Label>
                        <Select
                            value={form.financialYearStartMonth}
                            onValueChange={(value) => set("financialYearStartMonth", value)}
                        >
                            <SelectTrigger id="entity-fy">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {MONTHS.map((month) => (
                                    <SelectItem key={month.value} value={String(month.value)}>
                                        {month.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.financialYearStartMonth ? (
                            <p className="text-xs text-danger">{errors.financialYearStartMonth}</p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Read in IST. April gives the year label 2026-27.
                            </p>
                        )}
                    </div>
                </div>

                <p className="text-xs text-muted-foreground">
                    Clearing a field clears it on the entity. The state code and PAN must agree with the
                    GSTIN; setting a GSTIN fills both in when they are empty.
                </p>
            </div>
        </SectionCard>
    );
}
