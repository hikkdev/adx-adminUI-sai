"use client";

import * as React from "react";
import Link from "next/link";
import {
    ChevronLeft,
    Copy,
    GitBranch,
    GripVertical,
    Plus,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    FLOW_FIELD_TYPE_LABELS,
    type FlowField,
    type FlowFieldType,
    type FlowScreen,
    type OnboardingFlow,
} from "@/types";

interface FlowBoardProps {
    flow: OnboardingFlow;
}

let fieldSequence = 500;

const ADDABLE_TYPES: FlowFieldType[] = [
    "text",
    "textarea",
    "phone",
    "select",
    "radio",
    "checkbox",
    "switch",
    "slider",
    "image_upload",
    "selectable_cards",
    "info",
    "section_header",
];

export function FlowBoard({ flow }: FlowBoardProps) {
    const [lane, setLane] = React.useState<string>("main");
    const [screens, setScreens] = React.useState<Record<string, FlowScreen[]>>({
        main: flow.screens,
        ...Object.fromEntries(flow.branches.map((branch) => [branch.key, branch.screens])),
    });
    const [selectedScreen, setSelectedScreen] = React.useState<string | null>(
        flow.screens[0]?.key ?? null
    );
    const [selectedField, setSelectedField] = React.useState<string | null>(null);
    const [dirty, setDirty] = React.useState(false);

    const laneScreens = screens[lane] ?? [];
    const screen = laneScreens.find((item) => item.key === selectedScreen) ?? null;
    const field = screen?.fields.find((item) => item.id === selectedField) ?? null;

    const updateLane = (updater: (current: FlowScreen[]) => FlowScreen[]) => {
        setScreens((current) => ({ ...current, [lane]: updater(current[lane] ?? []) }));
        setDirty(true);
    };

    const patchScreen = (key: string, patch: Partial<FlowScreen>) =>
        updateLane((current) =>
            current.map((item) => (item.key === key ? { ...item, ...patch } : item))
        );

    const patchField = (patch: Partial<FlowField>) => {
        if (!screen || !field) return;
        patchScreen(screen.key, {
            fields: screen.fields.map((item) =>
                item.id === field.id ? { ...item, ...patch } : item
            ),
        });
    };

    const addField = (type: FlowFieldType) => {
        if (!screen) return;
        fieldSequence += 1;
        const created: FlowField = {
            id: `f_new_${fieldSequence}`,
            type,
            label: FLOW_FIELD_TYPE_LABELS[type],
            required: false,
            ...(type === "select" || type === "radio" || type === "selectable_cards"
                ? { options: ["Option 1", "Option 2"] }
                : {}),
        };
        patchScreen(screen.key, { fields: [...screen.fields, created] });
        setSelectedField(created.id);
    };

    const removeField = (id: string) => {
        if (!screen) return;
        patchScreen(screen.key, {
            fields: screen.fields.filter((item) => item.id !== id),
        });
        if (selectedField === id) setSelectedField(null);
    };

    const duplicateScreen = (key: string) => {
        const source = laneScreens.find((item) => item.key === key);
        if (!source) return;
        fieldSequence += 1;
        const copy: FlowScreen = {
            ...source,
            key: `${source.key}-copy-${fieldSequence}`,
            title: `${source.title} (copy)`,
            fields: source.fields.map((item, index) => ({
                ...item,
                id: `${item.id}_c${fieldSequence}${index}`,
            })),
        };
        const index = laneScreens.findIndex((item) => item.key === key);
        updateLane((current) => [
            ...current.slice(0, index + 1),
            copy,
            ...current.slice(index + 1),
        ]);
    };

    const removeScreen = (key: string) => {
        updateLane((current) => current.filter((item) => item.key !== key));
        if (selectedScreen === key) {
            setSelectedScreen(null);
            setSelectedField(null);
        }
    };

    const addScreen = () => {
        fieldSequence += 1;
        const created: FlowScreen = {
            key: `screen-${fieldSequence}`,
            title: "New screen",
            subtitle: "",
            ctaLabel: "Continue",
            fields: [],
        };
        updateLane((current) => [...current, created]);
        setSelectedScreen(created.key);
        setSelectedField(null);
    };

    const save = () => {
        setDirty(false);
        toast.success("Flow saved", {
            description: "The mobile apps pick this up on their next config refresh.",
        });
    };

    const lanes = [
        { key: "main", label: "Main flow" },
        ...flow.branches.map((branch) => ({ key: branch.key, label: branch.title })),
    ];

    return (
        <div className="space-y-4">
            <div>
                <Link
                    href="/flows"
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ChevronLeft className="size-4" />
                    Flow Editor
                </Link>
                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                            {flow.label}
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground">{flow.audience}</p>
                    </div>
                    <Button onClick={save} disabled={!dirty}>
                        {dirty ? "Save changes" : "Saved"}
                    </Button>
                </div>
            </div>

            {lanes.length > 1 && (
                <div className="flex items-center gap-1 rounded-lg border bg-card p-1 sm:w-fit">
                    {lanes.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                                setLane(item.key);
                                setSelectedScreen(screens[item.key]?.[0]?.key ?? null);
                                setSelectedField(null);
                            }}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                                lane === item.key
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {item.key !== "main" && <GitBranch className="size-3.5" />}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-[280px_1fr_320px]">
                {/* Screens rail */}
                <div className="space-y-2.5">
                    {laneScreens.map((item, index) => (
                        <Card
                            key={item.key}
                            className={cn(
                                "cursor-pointer rounded-lg border-border p-3.5 shadow-none transition-colors",
                                selectedScreen === item.key
                                    ? "border-primary/50 bg-primary/5"
                                    : "hover:bg-muted/40"
                            )}
                            onClick={() => {
                                setSelectedScreen(item.key);
                                setSelectedField(null);
                            }}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-start gap-2">
                                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                        {index + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {item.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.fields.length}{" "}
                                            {item.fields.length === 1 ? "field" : "fields"}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center">
                                    <button
                                        type="button"
                                        aria-label={`Duplicate ${item.title}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            duplicateScreen(item.key);
                                        }}
                                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    >
                                        <Copy className="size-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Delete ${item.title}`}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            removeScreen(item.key);
                                        }}
                                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-danger"
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </div>
                            </div>
                        </Card>
                    ))}
                    <button
                        type="button"
                        onClick={addScreen}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                        <Plus className="size-3.5" />
                        Add screen
                    </button>
                </div>

                {/* Screen editor */}
                {screen ? (
                    <Card className="h-fit rounded-lg border-border shadow-none">
                        <div className="space-y-3 border-b px-5 py-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="screen-title">Screen title</Label>
                                <Input
                                    id="screen-title"
                                    value={screen.title}
                                    onChange={(event) =>
                                        patchScreen(screen.key, { title: event.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-subtitle">Subtitle</Label>
                                    <Input
                                        id="screen-subtitle"
                                        value={screen.subtitle}
                                        onChange={(event) =>
                                            patchScreen(screen.key, { subtitle: event.target.value })
                                        }
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="screen-cta">Button label</Label>
                                    <Input
                                        id="screen-cta"
                                        value={screen.ctaLabel}
                                        onChange={(event) =>
                                            patchScreen(screen.key, { ctaLabel: event.target.value })
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                        <ul className="divide-y">
                            {screen.fields.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedField(item.id)}
                                        className={cn(
                                            "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors",
                                            selectedField === item.id
                                                ? "bg-primary/5"
                                                : "hover:bg-muted/40"
                                        )}
                                    >
                                        <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {item.label}
                                                {item.required && (
                                                    <span className="ml-1 text-danger">*</span>
                                                )}
                                            </p>
                                            {item.options && (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {item.options.join(" · ")}
                                                </p>
                                            )}
                                        </div>
                                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                            {FLOW_FIELD_TYPE_LABELS[item.type]}
                                        </span>
                                        {item.branching && (
                                            <GitBranch className="size-3.5 shrink-0 text-primary" />
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <div className="border-t px-5 py-3.5">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="bg-card">
                                        <Plus className="size-4" />
                                        Add field
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                                    {ADDABLE_TYPES.map((type) => (
                                        <DropdownMenuItem key={type} onClick={() => addField(type)}>
                                            {FLOW_FIELD_TYPE_LABELS[type]}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </Card>
                ) : (
                    <Card className="flex h-48 items-center justify-center rounded-lg border-dashed border-border shadow-none">
                        <p className="text-sm text-muted-foreground">
                            Select a screen on the left to edit it.
                        </p>
                    </Card>
                )}

                {/* Field editor */}
                <Card className="h-fit rounded-lg border-border shadow-none">
                    <div className="border-b px-5 py-4">
                        <h2 className="text-sm font-semibold text-foreground">Field settings</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            {field
                                ? FLOW_FIELD_TYPE_LABELS[field.type]
                                : "Pick a field to edit its settings"}
                        </p>
                    </div>
                    {field ? (
                        <div className="space-y-4 px-5 py-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="field-label">Label</Label>
                                <Input
                                    id="field-label"
                                    value={field.label}
                                    onChange={(event) => patchField({ label: event.target.value })}
                                />
                            </div>
                            {(field.type === "text" ||
                                field.type === "textarea" ||
                                field.type === "phone") && (
                                <div className="grid gap-1.5">
                                    <Label htmlFor="field-placeholder">Placeholder</Label>
                                    <Input
                                        id="field-placeholder"
                                        value={field.placeholder ?? ""}
                                        onChange={(event) =>
                                            patchField({ placeholder: event.target.value })
                                        }
                                    />
                                </div>
                            )}
                            {field.options && (
                                <div className="grid gap-1.5">
                                    <Label htmlFor="field-options">Options, one per line</Label>
                                    <Textarea
                                        id="field-options"
                                        rows={4}
                                        value={field.options.join("\n")}
                                        onChange={(event) =>
                                            patchField({
                                                options: event.target.value
                                                    .split("\n")
                                                    .filter((line) => line.trim().length > 0),
                                            })
                                        }
                                    />
                                </div>
                            )}
                            <div className="grid gap-1.5">
                                <Label htmlFor="field-helper">Helper text</Label>
                                <Input
                                    id="field-helper"
                                    value={field.helper ?? ""}
                                    onChange={(event) => patchField({ helper: event.target.value })}
                                    placeholder="Shown under the field"
                                />
                            </div>
                            <label className="flex items-center justify-between rounded-md border bg-card px-3 py-2.5">
                                <span className="text-sm text-foreground">Required</span>
                                <Switch
                                    checked={field.required}
                                    onCheckedChange={(checked) => patchField({ required: checked })}
                                />
                            </label>
                            {field.type === "selectable_cards" && (
                                <label className="flex items-center justify-between rounded-md border bg-card px-3 py-2.5">
                                    <span className="text-sm text-foreground">
                                        Branches the flow
                                    </span>
                                    <Switch
                                        checked={field.branching ?? false}
                                        onCheckedChange={(checked) =>
                                            patchField({ branching: checked })
                                        }
                                    />
                                </label>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full bg-card text-danger hover:text-danger"
                                onClick={() => removeField(field.id)}
                            >
                                <Trash2 className="size-4" />
                                Remove field
                            </Button>
                        </div>
                    ) : (
                        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                            Nothing selected.
                        </p>
                    )}
                </Card>
            </div>
        </div>
    );
}
