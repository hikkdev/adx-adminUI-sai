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
import { PageHeader } from "@/components/adx/page-header";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import type { RuleCondition } from "@/types";

interface RuleBuilderProps {
    rule: {
        name: string;
        priority: number;
        status: string;
        matchMode: "all" | "any";
        conditions: RuleCondition[];
        adjustment: { kind: string; value: string; appliesTo: string };
        schedule: { from: string; to: string };
        preview: [string, string][];
        conflicts: { name: string; note: string; meta: string }[];
    };
}

const conditionFields = ["Media type", "City tier", "Advertiser category", "Booking duration", "Locality grade", "Publisher tier"];
const operators = ["is", "is not", "is greater than or equal to", "is less than"];
const adjustmentKinds = ["Multiplier", "Fixed uplift", "Fixed discount", "Override rate"];

export function RuleBuilder({ rule }: RuleBuilderProps) {
    const [name, setName] = React.useState(rule.name);
    const [matchMode, setMatchMode] = React.useState<"all" | "any">(rule.matchMode);
    const [conditions, setConditions] = React.useState(rule.conditions);
    const [adjustmentKind, setAdjustmentKind] = React.useState(rule.adjustment.kind);
    const [adjustmentValue, setAdjustmentValue] = React.useState(rule.adjustment.value);
    const [appliesTo, setAppliesTo] = React.useState(rule.adjustment.appliesTo);

    const addCondition = () =>
        setConditions((current) => [
            ...current,
            {
                id: `c${current.length + 1}_new`,
                field: "Media type",
                operator: "is",
                value: "",
            },
        ]);

    const removeCondition = (id: string) =>
        setConditions((current) => current.filter((condition) => condition.id !== id));

    const updateCondition = (id: string, patch: Partial<RuleCondition>) =>
        setConditions((current) =>
            current.map((condition) =>
                condition.id === id ? { ...condition, ...patch } : condition
            )
        );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Rule builder"
                subtitle="Compose a pricing rule from conditions, an adjustment and a schedule"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.info(`Rule tested against yesterday's 214 quotes.`)}
                        >
                            Test rule
                        </Button>
                        <Button onClick={() => toast.success(`"${name}" saved as draft`)}>
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
                        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_120px_140px]">
                            <div className="space-y-1.5">
                                <Label htmlFor="rule-name">Rule name</Label>
                                <Input
                                    id="rule-name"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Priority</Label>
                                <Select defaultValue={String(rule.priority)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[1, 2, 3, 4, 5].map((priority) => (
                                            <SelectItem key={priority} value={String(priority)}>
                                                {priority}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <div className="flex h-10 items-center">
                                    <StatusBadge status={{ label: rule.status, tone: "neutral" }} />
                                </div>
                            </div>
                        </div>
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
                                        onClick={() => setMatchMode(mode)}
                                        className={cn(
                                            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                                            matchMode === mode
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
                            {conditions.map((condition) => (
                                <div
                                    key={condition.id}
                                    className="grid items-center gap-2 rounded-lg border p-2.5 md:grid-cols-[1fr_auto_1fr_auto]"
                                >
                                    <Select
                                        value={condition.field}
                                        onValueChange={(value) =>
                                            updateCondition(condition.id, { field: value })
                                        }
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {conditionFields.map((field) => (
                                                <SelectItem key={field} value={field}>
                                                    {field}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        value={condition.operator}
                                        onValueChange={(value) =>
                                            updateCondition(condition.id, { operator: value })
                                        }
                                    >
                                        <SelectTrigger className="h-9 w-full md:w-[220px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {operators.map((operator) => (
                                                <SelectItem key={operator} value={operator}>
                                                    {operator}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={condition.value}
                                        placeholder="Value"
                                        onChange={(event) =>
                                            updateCondition(condition.id, { value: event.target.value })
                                        }
                                        className="h-9"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8 shrink-0 justify-self-end"
                                        aria-label="Remove condition"
                                        onClick={() => removeCondition(condition.id)}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 h-8 bg-card"
                            onClick={addCondition}
                        >
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
                                {adjustmentKinds.map((kind) => (
                                    <button
                                        key={kind}
                                        type="button"
                                        onClick={() => setAdjustmentKind(kind)}
                                        className={cn(
                                            "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                                            adjustmentKind === kind
                                                ? "border-foreground bg-foreground text-background"
                                                : "bg-card text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {kind}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="adj-value">Value</Label>
                                    <Input
                                        id="adj-value"
                                        value={adjustmentValue}
                                        onChange={(event) => setAdjustmentValue(event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Applies to</Label>
                                    <Select value={appliesTo} onValueChange={setAppliesTo}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Base rate">Base rate</SelectItem>
                                            <SelectItem value="Base + production">
                                                Base + production
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </Card>

                        <Card className="rounded-lg border-border p-5 shadow-none">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Schedule
                            </h3>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Effective from</Label>
                                    <Select defaultValue={rule.schedule.from}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={rule.schedule.from}>
                                                {rule.schedule.from}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Effective to</Label>
                                    <Select defaultValue={rule.schedule.to}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={rule.schedule.to}>
                                                {rule.schedule.to}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Outside this window the rule stays saved but never fires.
                            </p>
                        </Card>
                    </div>
                </div>

                {/* Right rail */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Live preview
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Effect on a sample quote that matches every condition
                        </p>
                        <FieldList className="mt-4" items={rule.preview} />
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
                            <TriangleAlert className="size-3.5" />
                            Conflicts
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {rule.conflicts.length} overlapping rules share this window
                        </p>
                        <ul className="mt-3 space-y-3">
                            {rule.conflicts.map((conflict) => (
                                <li key={conflict.name} className="rounded-lg bg-muted/60 p-3">
                                    <p className="text-sm font-medium text-foreground">{conflict.name}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{conflict.note}</p>
                                    <p className="mt-1 text-[11px] font-medium text-warning">
                                        {conflict.meta}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
}
