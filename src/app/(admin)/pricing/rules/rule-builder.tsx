"use client";

import * as React from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { PageHeader } from "@/components/adx/page-header";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR } from "@/lib/format";
import { GRADES, GRADE_LABEL } from "@/services/rate-cards";
import {
    OPERATORS,
    OPERATOR_LABEL,
    RULE_FIELDS,
    priceModelService,
    type PriceRule,
    type RuleAdjustment,
    type RuleCondition,
    type RuleOperator,
    type SiteOption,
} from "@/services/price-model";
import type { MediaType } from "@/types/pricing-engine";

interface RuleBuilderProps {
    rules: PriceRule[];
    mediaTypes: MediaType[];
    /** A real site the preview traces against. Null when there are no listings. */
    sampleSite: SiteOption | null;
    embedded?: boolean;
    onChanged: () => void;
}

const NEW = "__new__";

/** The frame's four chips, and what each one is in the backend's vocabulary. */
const ADJUSTMENTS = [
    { kind: "Multiplier", adjustment: "MULTIPLIER", sign: 1, unit: "×" },
    { kind: "Fixed uplift", adjustment: "BASE_ADJUST", sign: 1, unit: "₹" },
    { kind: "Fixed discount", adjustment: "BASE_ADJUST", sign: -1, unit: "₹" },
    { kind: "Override rate", adjustment: "OVERRIDE", sign: 1, unit: "₹" },
] as const;
type AdjustmentKind = (typeof ADJUSTMENTS)[number]["kind"];

function kindOf(rule: PriceRule | null): AdjustmentKind {
    if (!rule || rule.adjustment === "MULTIPLIER") return "Multiplier";
    if (rule.adjustment === "OVERRIDE") return "Override rate";
    return Number(rule.value) < 0 ? "Fixed discount" : "Fixed uplift";
}

const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const isoFrom = (date: string, endOfDay = false) =>
    date ? new Date(`${date}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString() : null;

/**
 * The DR 10 rule builder: name and priority, conditions matched ALL or ANY,
 * one adjustment, a schedule, and a rail that previews the rule on a real site
 * and lists the rules it overlaps.
 *
 * "Applies to" (base vs base + production) is not drawn. Rules act on the daily
 * rate before production is added; there is no other thing for them to act on,
 * and a selector with one honest option is not a selector.
 */
export function RuleBuilder({ rules, mediaTypes, sampleSite, embedded, onChanged }: RuleBuilderProps) {
    const [selectedId, setSelectedId] = React.useState<string>(rules[0]?.id ?? NEW);
    const selected = rules.find((rule) => rule.id === selectedId) ?? null;

    // If the selected rule was deleted under us, fall back to the first.
    if (selectedId !== NEW && !selected && rules.length > 0) setSelectedId(rules[0]!.id);

    return (
        <RuleForm
            key={selected?.id ?? NEW}
            rule={selected}
            others={rules.filter((rule) => rule.id !== selected?.id)}
            mediaTypes={mediaTypes}
            sampleSite={sampleSite}
            embedded={embedded}
            picker={
                <div className="flex items-center gap-2">
                    <Select value={selectedId} onValueChange={setSelectedId}>
                        <SelectTrigger className="h-9 w-64 bg-card">
                            <SelectValue placeholder="Choose a rule" />
                        </SelectTrigger>
                        <SelectContent>
                            {rules.map((rule) => (
                                <SelectItem key={rule.id} value={rule.id}>
                                    {rule.name}
                                    {!rule.isActive ? " (off)" : ""}
                                </SelectItem>
                            ))}
                            <SelectItem value={NEW}>New rule…</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button variant="outline" className="bg-card" onClick={() => setSelectedId(NEW)}>
                        <Plus className="mr-1.5 size-4" />
                        New rule
                    </Button>
                </div>
            }
            onSaved={(id) => {
                setSelectedId(id);
                onChanged();
            }}
            onDeleted={() => {
                setSelectedId(NEW);
                onChanged();
            }}
        />
    );
}

function RuleForm({
    rule,
    others,
    mediaTypes,
    sampleSite,
    embedded,
    picker,
    onSaved,
    onDeleted,
}: {
    rule: PriceRule | null;
    others: PriceRule[];
    mediaTypes: MediaType[];
    sampleSite: SiteOption | null;
    embedded?: boolean;
    picker: React.ReactNode;
    onSaved: (id: string) => void;
    onDeleted: () => void;
}) {
    const [name, setName] = React.useState(rule?.name ?? "");
    const [priority, setPriority] = React.useState(rule?.priority ?? 100);
    const [isActive, setIsActive] = React.useState(rule?.isActive ?? true);
    const [matchAny, setMatchAny] = React.useState(rule?.matchAny ?? false);
    const [conditions, setConditions] = React.useState<(RuleCondition & { key: string })[]>(() =>
        (rule?.conditions ?? []).map((condition, index) => ({ ...condition, key: `c${index}` }))
    );
    const [kind, setKind] = React.useState<AdjustmentKind>(kindOf(rule));
    const [value, setValue] = React.useState(
        rule ? String(Math.abs(Number(rule.value))) : "1.10"
    );
    const [from, setFrom] = React.useState(dateInput(rule?.startsAt ?? null));
    const [to, setTo] = React.useState(dateInput(rule?.endsAt ?? null));
    const [busy, setBusy] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    // Keys for conditions added this session, before the server gives them ids.
    const nextKey = React.useRef(0);
    const [preview, setPreview] = React.useState<
        | { state: "idle" }
        | { state: "ready"; before: string; after: string; fires: boolean; site: string }
        | { state: "error"; message: string }
    >({ state: "idle" });

    const chip = ADJUSTMENTS.find((candidate) => candidate.kind === kind)!;
    const valueOk = /^\d{1,12}(\.\d{1,4})?$/.test(value) && Number(value) > 0;
    const signedValue = chip.sign < 0 ? `-${value}` : value;

    const addCondition = () => {
        nextKey.current += 1;
        const key = `n${nextKey.current}`;
        setConditions((current) => [
            ...current,
            { key, field: "mediaTypeId", operator: "eq", value: "" },
        ]);
    };
    const removeCondition = (key: string) =>
        setConditions((current) => current.filter((condition) => condition.key !== key));
    const updateCondition = (key: string, patch: Partial<RuleCondition>) =>
        setConditions((current) =>
            current.map((condition) => (condition.key === key ? { ...condition, ...patch } : condition))
        );

    const previewRule = React.useCallback(
        () => ({
            name: name.trim() || "This rule",
            matchAny,
            adjustment: chip.adjustment as RuleAdjustment,
            value: signedValue,
            conditions: conditions
                .filter((condition) => condition.value.trim() !== "")
                .map(({ field, operator, value }) => ({ field, operator, value })),
        }),
        [name, matchAny, chip.adjustment, signedValue, conditions]
    );

    const runPreview = React.useCallback(() => {
        if (!sampleSite) {
            setPreview({ state: "error", message: "No listing to trace against yet." });
            return;
        }
        if (!valueOk) {
            setPreview({ state: "error", message: "Enter a positive number for the adjustment." });
            return;
        }
        const base = { listingId: sampleSite.id, days: 28 };
        Promise.all([
            priceModelService.simulate(base),
            priceModelService.simulate({ ...base, previewRule: previewRule() }),
        ])
            .then(([before, after]) => {
                setPreview({
                    state: "ready",
                    before: before.ratePerDay,
                    after: after.ratePerDay,
                    fires: after.rows.some((row) => row.rule.endsWith("(unsaved)")),
                    site: sampleSite.title,
                });
            })
            .catch((cause: unknown) => {
                setPreview({
                    state: "error",
                    message: cause instanceof Error ? cause.message : "Could not run the preview.",
                });
            });
    }, [sampleSite, valueOk, previewRule]);

    // One trace on arrival, so the rail is never blank; after that, "Test rule".
    const previewed = React.useRef(false);
    React.useEffect(() => {
        if (previewed.current) return;
        previewed.current = true;
        runPreview();
    }, [runPreview]);

    async function save() {
        setBusy(true);
        try {
            const body = {
                name: name.trim(),
                priority,
                matchAny,
                adjustment: chip.adjustment as RuleAdjustment,
                value: signedValue,
                startsAt: isoFrom(from),
                endsAt: isoFrom(to, true),
                isActive,
            };
            const saved = rule
                ? await priceModelService.updateRule(rule.id, body)
                : await priceModelService.createRule(body);
            await priceModelService.setConditions(
                saved.id,
                conditions
                    .filter((condition) => condition.value.trim() !== "")
                    .map(({ field, operator, value }) => ({ field, operator, value }))
            );
            toast.success(`"${body.name}" saved`, {
                description: isActive ? "Live on every quote that matches." : "Saved but switched off.",
            });
            onSaved(saved.id);
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the rule.");
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!rule) return;
        setBusy(true);
        try {
            await priceModelService.deleteRule(rule.id);
            toast.success(`"${rule.name}" deleted`);
            setDeleting(false);
            onDeleted();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not delete the rule.");
        } finally {
            setBusy(false);
        }
    }

    /* Overlap: active, windows intersect, and a shared condition field (or both unconditional). */
    const conflicts = others.filter((other) => {
        if (!other.isActive) return false;
        const otherFrom = other.startsAt ? new Date(other.startsAt).getTime() : -Infinity;
        const otherTo = other.endsAt ? new Date(other.endsAt).getTime() : Infinity;
        const mineFrom = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
        const mineTo = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
        if (otherFrom > mineTo || otherTo < mineFrom) return false;
        const mine = new Set(conditions.map((condition) => condition.field));
        if (mine.size === 0 || other.conditions.length === 0) return true;
        return other.conditions.some((condition) => mine.has(condition.field));
    });

    const fieldLabel = (field: string) =>
        RULE_FIELDS.find((candidate) => candidate.value === field)?.label ?? field;

    const previewItems: [string, string][] =
        preview.state === "ready"
            ? [
                  ["Sample site", preview.site],
                  ["Without this rule", `${formatINR(Number(preview.before))} / day`],
                  ["With this rule", `${formatINR(Number(preview.after))} / day`],
                  [
                      "Effect",
                      preview.fires
                          ? `${(((Number(preview.after) - Number(preview.before)) / Number(preview.before)) * 100).toFixed(1)}%`
                          : "Does not match this site",
                  ],
              ]
            : preview.state === "error"
              ? [["Preview", preview.message]]
              : [["Preview", "Tracing…"]];

    return (
        <div className="space-y-5">
            <PageHeader
                size={embedded ? "section" : "page"}
                title="Rule builder"
                subtitle="Compose a pricing rule from conditions, an adjustment and a schedule"
                actions={
                    <>
                        {picker}
                        <Button variant="outline" className="bg-card" onClick={runPreview}>
                            Test rule
                        </Button>
                        <Button
                            disabled={busy || name.trim().length < 2 || !valueOk}
                            onClick={() => void save()}
                        >
                            Save rule
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 xl:grid-cols-3">
                <div className="space-y-4 xl:col-span-2">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Rule definition
                        </h3>
                        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_120px_160px]">
                            <div className="space-y-1.5">
                                <Label htmlFor="rule-name">Rule name</Label>
                                <Input
                                    id="rule-name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    placeholder="Metro premium, Q4"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="rule-priority">Priority</Label>
                                <Input
                                    id="rule-priority"
                                    type="number"
                                    min="0"
                                    max="9999"
                                    value={priority}
                                    onChange={(event) => setPriority(Number(event.target.value) || 0)}
                                    className="tabular-nums"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <div className="flex h-10 items-center gap-3">
                                    <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Rule is active" />
                                    <StatusBadge
                                        status={
                                            isActive
                                                ? { label: "Active", tone: "success" }
                                                : { label: "Off", tone: "neutral" }
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Lower priority numbers fire first. Multipliers compound; an override wins
                            outright.
                        </p>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <div className="flex items-center justify-between gap-4">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Conditions
                            </h3>
                            <div className="inline-flex rounded-lg border bg-card p-0.5">
                                {(["all", "any"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setMatchAny(mode === "any")}
                                        className={cn(
                                            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                                            (mode === "any") === matchAny
                                                ? "bg-foreground text-background"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        Match {mode.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 space-y-2.5">
                            {conditions.length === 0 && (
                                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                                    No conditions: this rule fires on every quote.
                                </p>
                            )}
                            {conditions.map((condition) => (
                                <div
                                    key={condition.key}
                                    className="grid items-center gap-2 rounded-lg border p-2.5 md:grid-cols-[1fr_auto_1fr_auto]"
                                >
                                    <Select
                                        value={condition.field}
                                        onValueChange={(field) =>
                                            updateCondition(condition.key, { field, value: "" })
                                        }
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {RULE_FIELDS.map((field) => (
                                                <SelectItem key={field.value} value={field.value}>
                                                    {field.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        value={condition.operator}
                                        onValueChange={(operator) =>
                                            updateCondition(condition.key, { operator: operator as RuleOperator })
                                        }
                                    >
                                        <SelectTrigger className="h-9 w-full md:w-[200px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {OPERATORS.map((operator) => (
                                                <SelectItem key={operator} value={operator}>
                                                    {OPERATOR_LABEL[operator]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ConditionValue
                                        condition={condition}
                                        mediaTypes={mediaTypes}
                                        onChange={(value) => updateCondition(condition.key, { value })}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 justify-self-end"
                                        aria-label="Remove condition"
                                        onClick={() => removeCondition(condition.key)}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" size="sm" className="mt-3 h-8 bg-card" onClick={addCondition}>
                            <Plus className="mr-1 size-3.5" />
                            Add condition
                        </Button>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Adjustment
                            </h3>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {ADJUSTMENTS.map((candidate) => (
                                    <button
                                        key={candidate.kind}
                                        type="button"
                                        onClick={() => setKind(candidate.kind)}
                                        className={cn(
                                            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                                            kind === candidate.kind
                                                ? "border-foreground bg-foreground text-background"
                                                : "bg-card text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {candidate.kind}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="adj-value">Value</Label>
                                    <div className="relative">
                                        <Input
                                            id="adj-value"
                                            value={value}
                                            onChange={(event) => setValue(event.target.value)}
                                            className={cn("pr-7 text-right tabular-nums", !valueOk && "border-danger")}
                                            aria-invalid={!valueOk}
                                        />
                                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                            {chip.unit}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Applies to</Label>
                                    <p className="flex h-10 items-center text-sm text-muted-foreground">
                                        Daily rate, before production
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Schedule
                            </h3>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="rule-from">Effective from</Label>
                                    <Input
                                        id="rule-from"
                                        type="date"
                                        value={from}
                                        onChange={(event) => setFrom(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="rule-to">Effective to</Label>
                                    <Input
                                        id="rule-to"
                                        type="date"
                                        value={to}
                                        min={from || undefined}
                                        onChange={(event) => setTo(event.target.value)}
                                    />
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Outside this window the rule stays saved but never fires. Leave both
                                blank for always.
                            </p>
                        </Card>
                    </div>

                    {rule && (
                        <div className="flex justify-end">
                            <Button
                                variant="ghost"
                                className="text-danger hover:text-danger"
                                disabled={busy}
                                onClick={() => setDeleting(true)}
                            >
                                Delete rule
                            </Button>
                        </div>
                    )}
                </div>

                {/* Right rail */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Live preview
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Effect on a real site&apos;s 28-day quote, unsaved edits included
                        </p>
                        <FieldList className="mt-4" items={previewItems} />
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3
                            className={cn(
                                "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
                                conflicts.length > 0 ? "text-warning" : "text-muted-foreground"
                            )}
                        >
                            <TriangleAlert className="size-3.5" />
                            Conflicts
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {conflicts.length === 0
                                ? "No active rule shares this window and these facts."
                                : `${conflicts.length} overlapping ${conflicts.length === 1 ? "rule shares" : "rules share"} this window`}
                        </p>
                        <ul className="mt-3 space-y-3">
                            {conflicts.map((conflict) => (
                                <li key={conflict.id} className="rounded-lg bg-muted/60 p-3">
                                    <p className="text-sm font-medium text-foreground">{conflict.name}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {conflict.conditions.length === 0
                                            ? "Fires on every quote"
                                            : `Tests ${[...new Set(conflict.conditions.map((c) => fieldLabel(c.field)))].join(", ").toLowerCase()}`}
                                    </p>
                                    <p className="mt-1 text-[11px] font-medium text-warning">
                                        Priority {conflict.priority} · {kindOf(conflict)}{" "}
                                        {Math.abs(Number(conflict.value))}
                                        {conflict.adjustment === "MULTIPLIER" ? "×" : ""}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            </div>

            <ConfirmDialog
                open={deleting}
                onOpenChange={setDeleting}
                title="Delete this rule?"
                description="Quotes stop applying it immediately. Saved quotes keep the trace they were priced with."
                confirmLabel="Delete"
                destructive
                busy={busy}
                onConfirm={() => void remove()}
            />
        </div>
    );
}

/** The value control fits the fact: a catalogue picker for media type, grades for grade, text otherwise. */
function ConditionValue({
    condition,
    mediaTypes,
    onChange,
}: {
    condition: RuleCondition;
    mediaTypes: MediaType[];
    onChange: (value: string) => void;
}) {
    if (condition.field === "mediaTypeId" && condition.operator !== "in") {
        return (
            <Combobox
                items={mediaTypes
                    .filter((type) => !type.mergedIntoId)
                    .map((type) => ({
                        label: type.name,
                        value: type.id,
                        description: type.formatGroup ?? undefined,
                    }))}
                value={condition.value}
                onValueChange={onChange}
                placeholder="Pick a media type"
                searchPlaceholder="Search the catalogue…"
                className="h-9"
            />
        );
    }
    if (condition.field === "grade" && condition.operator !== "in") {
        return (
            <Select value={condition.value} onValueChange={onChange}>
                <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pick a grade" />
                </SelectTrigger>
                <SelectContent>
                    {GRADES.map((grade) => (
                        <SelectItem key={grade} value={grade}>
                            {GRADE_LABEL[grade]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }
    return (
        <Input
            value={condition.value}
            placeholder={condition.operator === "in" ? "Comma-separated values" : "Value"}
            onChange={(event) => onChange(event.target.value)}
            className="h-9"
        />
    );
}
