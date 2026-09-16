"use client";

import * as React from "react";
import { ArrowRight, Clock, ListOrdered, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { milestoneService } from "@/services/milestones";
import {
    FULFILMENT_REQUIREMENT_LABELS,
    FULFILMENT_STEP_TYPE_META,
    requirementHasLabel,
    type FulfilmentPlan,
    type FulfilmentTemplate,
} from "@/types";
import { NewPlanDialog, PlanStepsDialog } from "./plan-dialogs";
import { NewTemplateDialog } from "./template-dialog";

interface TemplatesViewProps {
    templates: FulfilmentTemplate[];
    plans: FulfilmentPlan[];
    /** Refetches both lists after a write actually lands. */
    onChanged: () => void;
}

/**
 * The templates and plans, live.
 *
 * The Active switch used to change local state and show a toast; reload and
 * the template was back. It now PATCHes and is optimistic about it — the
 * switch moves at once, and moves back if the server refuses — with the
 * toast said only once the write landed. Everything else that changes a
 * template or a plan goes through a dialog that talks to the API and calls
 * `onChanged` afterwards, so what is drawn is always what the backend holds.
 */
export function TemplatesView({ templates, plans, onChanged }: TemplatesViewProps) {
    /* The switch's optimistic position, per id, until the server answers.
       An entry that agrees with fresh data is harmless; a refused one is
       deleted so the card falls back to what the server holds. */
    const [templateOverrides, setTemplateOverrides] = React.useState<Record<string, boolean>>({});
    const [planOverrides, setPlanOverrides] = React.useState<Record<string, boolean>>({});
    const [newTemplateOpen, setNewTemplateOpen] = React.useState(false);
    const [newPlanOpen, setNewPlanOpen] = React.useState(false);
    const [editingPlan, setEditingPlan] = React.useState<FulfilmentPlan | null>(null);

    const templateActive = (template: FulfilmentTemplate) => templateOverrides[template.id] ?? template.isActive;
    const planActive = (plan: FulfilmentPlan) => planOverrides[plan.id] ?? plan.isActive;

    async function toggleTemplate(template: FulfilmentTemplate, isActive: boolean) {
        setTemplateOverrides((current) => ({ ...current, [template.id]: isActive }));
        try {
            const saved = await milestoneService.patchTemplate(template.id, { isActive });
            toast.success(`${saved.title} ${saved.isActive ? "activated" : "deactivated"}`, {
                description: saved.isActive
                    ? "Orders and plans can use it again."
                    : "It cannot be added to an order or saved into a plan until it is active.",
            });
            onChanged();
        } catch (cause) {
            setTemplateOverrides((current) => {
                const next = { ...current };
                delete next[template.id];
                return next;
            });
            toast.error(cause instanceof Error ? cause.message : "Could not change that template.");
        }
    }

    async function togglePlan(plan: FulfilmentPlan, isActive: boolean) {
        setPlanOverrides((current) => ({ ...current, [plan.id]: isActive }));
        try {
            const saved = await milestoneService.patchPlan(plan.id, { isActive });
            toast.success(`${saved.name} ${saved.isActive ? "activated" : "deactivated"}`);
            onChanged();
        } catch (cause) {
            setPlanOverrides((current) => {
                const next = { ...current };
                delete next[plan.id];
                return next;
            });
            toast.error(cause instanceof Error ? cause.message : "Could not change that plan.");
        }
    }

    const activeTemplates = templates.filter(templateActive);

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Step templates"
                    subtitle="Each template defines what the agent app collects as proof."
                    actions={
                        <Button variant="outline" className="bg-card" onClick={() => setNewTemplateOpen(true)}>
                            <Plus className="mr-1.5 size-4" />
                            New template
                        </Button>
                    }
                />
                {templates.length === 0 ? (
                    <Card className="rounded-lg border-dashed p-6 text-center text-sm text-muted-foreground shadow-none">
                        No templates yet. The first one is the first proof an agent will be asked for.
                    </Card>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {templates.map((template) => {
                            const active = templateActive(template);
                            return (
                                <Card
                                    key={template.id}
                                    className="flex flex-col rounded-lg border-border p-5 shadow-none"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="truncate text-sm font-semibold text-foreground">
                                                {template.title}
                                            </h3>
                                            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="size-3.5" />
                                                {/* Null is unestimated, which is not zero minutes. */}
                                                {template.estimatedDurationMins === null
                                                    ? "no estimate"
                                                    : `about ${template.estimatedDurationMins} min on site`}
                                            </p>
                                        </div>
                                        <StatusBadge status={FULFILMENT_STEP_TYPE_META[template.type]} />
                                    </div>
                                    <p className="mt-2.5 flex-1 text-sm text-muted-foreground">
                                        {template.description ?? "—"}
                                    </p>
                                    <ul className="mt-3 space-y-1">
                                        {template.requirements.map((requirement, index) => (
                                            <li
                                                key={`${template.id}-req-${index}`}
                                                className="flex items-center gap-2 text-xs text-muted-foreground"
                                            >
                                                <span className="size-1 rounded-full bg-muted-foreground/50" />
                                                <span>
                                                    {FULFILMENT_REQUIREMENT_LABELS[requirement.kind]}
                                                    {requirementHasLabel(requirement) ? `: ${requirement.label}` : ""}
                                                    {requirementHasLabel(requirement) && requirement.optional ? (
                                                        <span className="text-muted-foreground/70"> (optional)</span>
                                                    ) : null}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                                        <span className="text-xs text-muted-foreground">
                                            {template.updatedAt ? `Updated ${formatDate(template.updatedAt)}` : ""}
                                        </span>
                                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                            {active ? "Active" : "Inactive"}
                                            <Switch
                                                checked={active}
                                                onCheckedChange={(checked) => void toggleTemplate(template, checked)}
                                            />
                                        </label>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Fulfilment plans"
                    subtitle="Ordered chains of templates, issued to an order from its listing's plan or the category default."
                    actions={
                        <Button variant="outline" className="bg-card" onClick={() => setNewPlanOpen(true)}>
                            <Plus className="mr-1.5 size-4" />
                            New plan
                        </Button>
                    }
                />
                {plans.length === 0 ? (
                    <Card className="rounded-lg border-dashed p-6 text-center text-sm text-muted-foreground shadow-none">
                        No plans yet. A plan is what turns templates into the steps an order is issued.
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {plans.map((plan) => {
                            const active = planActive(plan);
                            return (
                                <Card key={plan.id} className="rounded-lg border-border p-5 shadow-none">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                {plan.description ?? "—"}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                                {active ? "Active" : "Inactive"}
                                                <Switch
                                                    checked={active}
                                                    onCheckedChange={(checked) => void togglePlan(plan, checked)}
                                                />
                                            </label>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="bg-card"
                                                onClick={() => setEditingPlan(plan)}
                                            >
                                                <ListOrdered className="mr-1.5 size-4" />
                                                Edit steps
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        {plan.items.length === 0 && (
                                            <span className="text-xs text-muted-foreground">
                                                No steps yet — an order issued this plan would get nothing.
                                            </span>
                                        )}
                                        {plan.items.map((item, index) => (
                                            <React.Fragment key={`${plan.id}-${item.order}`}>
                                                {index > 0 && (
                                                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                                                )}
                                                <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-foreground">
                                                    <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                                        {item.order}
                                                    </span>
                                                    {/* The joined template's title, or the id when
                                                        the join did not come. */}
                                                    {item.title ?? item.templateId}
                                                    {item.optional && (
                                                        <span className="text-muted-foreground">(optional)</span>
                                                    )}
                                                    {item.templateActive === false && (
                                                        <span className="text-warning">(template inactive)</span>
                                                    )}
                                                </span>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </section>

            <NewTemplateDialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen} onCreated={onChanged} />
            <NewPlanDialog open={newPlanOpen} onOpenChange={setNewPlanOpen} onCreated={onChanged} />
            <PlanStepsDialog
                plan={editingPlan}
                onOpenChange={(open) => !open && setEditingPlan(null)}
                templates={activeTemplates}
                onSaved={onChanged}
            />
        </div>
    );
}
