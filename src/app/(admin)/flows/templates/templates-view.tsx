"use client";

import * as React from "react";
import { ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import {
    FULFILMENT_REQUIREMENT_LABELS,
    FULFILMENT_STEP_TYPE_META,
    type FulfilmentPlan,
    type FulfilmentTemplate,
} from "@/types";

interface TemplatesViewProps {
    templates: FulfilmentTemplate[];
    plans: FulfilmentPlan[];
}

export function TemplatesView({ templates: initialTemplates, plans }: TemplatesViewProps) {
    const [templates, setTemplates] = React.useState(initialTemplates);

    const toggleActive = (id: string, active: boolean) => {
        setTemplates((current) =>
            current.map((template) =>
                template.id === id ? { ...template, active } : template
            )
        );
        const template = templates.find((item) => item.id === id);
        toast.success(`${template?.title ?? id} ${active ? "activated" : "deactivated"}`);
    };

    const templateById = (id: string) => templates.find((template) => template.id === id);

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Step templates"
                    subtitle="Each template defines what the agent app collects as proof."
                />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {templates.map((template) => (
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
                                        about {template.estimatedMins} min on site
                                    </p>
                                </div>
                                <StatusBadge
                                    status={FULFILMENT_STEP_TYPE_META[template.type]}
                                />
                            </div>
                            <p className="mt-2.5 flex-1 text-sm text-muted-foreground">
                                {template.description}
                            </p>
                            <ul className="mt-3 space-y-1">
                                {template.requirements.map((requirement, index) => (
                                    <li
                                        key={`${template.id}-req-${index}`}
                                        className="flex items-center gap-2 text-xs text-muted-foreground"
                                    >
                                        <span className="size-1 rounded-full bg-muted-foreground/50" />
                                        {FULFILMENT_REQUIREMENT_LABELS[requirement.kind]}
                                        {requirement.label ? `: ${requirement.label}` : ""}
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-4 flex items-center justify-between border-t pt-3">
                                <span className="text-xs text-muted-foreground">
                                    Updated {formatDate(template.updated)}
                                </span>
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {template.active ? "Active" : "Inactive"}
                                    <Switch
                                        checked={template.active}
                                        onCheckedChange={(checked) =>
                                            toggleActive(template.id, checked)
                                        }
                                    />
                                </label>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <PageHeader
                    size="section"
                    title="Fulfilment plans"
                    subtitle="Ordered chains of templates applied to orders by campaign type."
                />
                <div className="space-y-4">
                    {plans.map((plan) => (
                        <Card key={plan.id} className="rounded-lg border-border p-5 shadow-none">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground">
                                        {plan.name}
                                    </h3>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {plan.description}
                                    </p>
                                </div>
                                <StatusBadge
                                    status={
                                        plan.active
                                            ? { label: "Active", tone: "success" }
                                            : { label: "Inactive", tone: "neutral" }
                                    }
                                />
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                {plan.items
                                    .slice()
                                    .sort((a, b) => a.order - b.order)
                                    .map((item, index) => {
                                        const template = templateById(item.templateId);
                                        return (
                                            <React.Fragment key={`${plan.id}-${item.templateId}`}>
                                                {index > 0 && (
                                                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60" />
                                                )}
                                                <span
                                                    className={
                                                        "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
                                                    }
                                                >
                                                    <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                                        {item.order}
                                                    </span>
                                                    {template?.title ?? item.templateId}
                                                    {item.optional && (
                                                        <span className="text-muted-foreground">
                                                            (optional)
                                                        </span>
                                                    )}
                                                </span>
                                            </React.Fragment>
                                        );
                                    })}
                            </div>
                        </Card>
                    ))}
                </div>
            </section>
        </div>
    );
}
