"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ArchiveRestore, Eye, Pencil, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkActions, type BulkAction } from "@/components/adx/bulk-actions";
import { ConfirmDialog } from "@/components/adx/confirm-dialog";
import { DataTable } from "@/components/adx/data-table";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { StatusBadge } from "@/components/adx/status-badge";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import {
    CUSTOM_FIELD_ENTITIES,
    CUSTOM_FIELD_ENTITY_LABEL,
    CUSTOM_FIELD_KIND_LABEL,
    LEAVE_ALL,
    SHOW_ON_SWITCHES,
    customFieldsService,
    sortDefs,
    switchPatch,
    type CustomFieldDef,
    type CustomFieldEntity,
    type CustomFieldKind,
    type SwitchChoice,
    type SwitchChoices,
} from "@/services/custom-fields";
import { CustomFieldDialog } from "./custom-field-dialog";
import type { DefsByEntity } from "./custom-fields-loader";

/**
 * CF-1: the custom fields desk — one tab per record type, its definitions
 * in order, each saying what kind it is, whether it is required, where it
 * shows and whether the record's owner may answer it. Adding and editing
 * need `settings.edit`; archiving keeps every answer.
 *
 * 28 Sep 2026: each tab's fields are selectable — archive, restore, or set
 * where they show and whether the owner may answer, each the single-field
 * route once per field (a switch change is the ordinary PATCH, carrying
 * only the switches it moves on that field).
 */
export function CustomFieldsView({ defs, onChanged }: { defs: DefsByEntity; onChanged: () => void }) {
    const { can } = useAuth();
    const mayEdit = can("settings.edit");
    const [entity, setEntity] = React.useState<CustomFieldEntity>("PUBLISHER");
    const [showArchived, setShowArchived] = React.useState(false);
    const [dialog, setDialog] = React.useState<{ entity: CustomFieldEntity; def: CustomFieldDef | null } | null>(null);
    const [archiving, setArchiving] = React.useState<CustomFieldDef | null>(null);
    const [busy, setBusy] = React.useState(false);
    const bulkActions = useFieldBulkActions(mayEdit);

    const total = CUSTOM_FIELD_ENTITIES.reduce((sum, key) => sum + defs[key].filter((def) => !def.archivedAt).length, 0);

    async function archive(def: CustomFieldDef) {
        setBusy(true);
        try {
            await customFieldsService.archive(def.id);
            toast.success(`“${def.label}” archived`, { description: "Every answer is kept; the field is asked no more." });
            setArchiving(null);
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    async function restore(def: CustomFieldDef) {
        setBusy(true);
        try {
            await customFieldsService.restore(def.id);
            toast.success(`“${def.label}” restored`, { description: "It is asked again, with every answer it had." });
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    }

    const columns: ColumnDef<CustomFieldDef>[] = [
        {
            id: "field",
            header: "Field",
            cell: ({ row: { original: row } }) => (
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        {row.label}
                        {row.archivedAt && <StatusBadge status={{ label: "Archived", tone: "neutral" }} />}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">{row.key}</p>
                    {row.hint && <p className="text-xs text-muted-foreground">{row.hint}</p>}
                </div>
            ),
        },
        {
            id: "kind",
            header: "Kind",
            cell: ({ row: { original: row } }) => (
                <span className="text-sm text-muted-foreground">
                    {CUSTOM_FIELD_KIND_LABEL[row.kind as CustomFieldKind] ?? row.kind}
                    {row.options?.length ? ` · ${row.options.length} options` : ""}
                </span>
            ),
        },
        { id: "required", header: "Required", cell: ({ row: { original: row } }) => <span className="text-sm text-muted-foreground">{row.required ? "Yes" : "No"}</span> },
        {
            id: "shows",
            header: "Shows",
            cell: ({ row: { original: row } }) => (
                <div className="flex flex-wrap gap-1" data-testid={`custom-field-shows-${row.key}`}>
                    {row.showOnDesk && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Desk</span>}
                    {row.showInApps && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Apps</span>}
                    {row.showOnWebsite && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Website</span>}
                    {!row.showOnDesk && !row.showInApps && !row.showOnWebsite && <span className="text-xs text-muted-foreground">Nowhere</span>}
                </div>
            ),
        },
        { id: "owner", header: "Owner may edit", cell: ({ row: { original: row } }) => <span className="text-sm text-muted-foreground">{row.editableByOwner ? "Yes" : "No"}</span> },
        {
            id: "order",
            header: () => <span className="block text-right">Order</span>,
            cell: ({ row: { original: row } }) => <span className="block text-right text-sm tabular-nums text-muted-foreground">{row.sortOrder}</span>,
        },
        {
            id: "actions",
            header: "",
            cell: ({ row: { original: row } }) =>
                !mayEdit ? null : row.archivedAt ? (
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => void restore(row)} data-testid={`custom-field-restore-${row.key}`}>
                            <ArchiveRestore className="mr-1 size-3.5" />
                            Restore
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setDialog({ entity: row.entity, def: row })} aria-label={`Edit ${row.label}`} data-testid={`custom-field-edit-${row.key}`}>
                            <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-danger hover:text-danger" onClick={() => setArchiving(row)} aria-label={`Archive ${row.label}`} data-testid={`custom-field-archive-${row.key}`}>
                            <Archive className="size-3.5" />
                        </Button>
                    </div>
                ),
        },
    ];

    return (
        <div className="space-y-5" data-testid="custom-fields-desk">
            <PageHeader
                title="Custom fields"
                subtitle={`${total} ${total === 1 ? "field" : "fields"} across the four record types. The extra questions no column holds — asked on the desk's “Extra details” card, in the apps, or on the website, and answered by ops or by the record's owner.`}
                actions={
                    mayEdit ? (
                        <Button onClick={() => setDialog({ entity, def: null })} data-testid="custom-fields-add">
                            <Plus className="mr-1.5 size-4" />
                            Add field
                        </Button>
                    ) : undefined
                }
            />

            <Tabs value={entity} onValueChange={(value) => setEntity(value as CustomFieldEntity)}>
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                    {CUSTOM_FIELD_ENTITIES.map((key) => (
                        <TabsTrigger
                            key={key}
                            value={key}
                            className="-mb-px rounded-none border-b-2 border-transparent px-0 pb-2.5 pt-1 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                            data-testid={`custom-fields-tab-${key}`}
                        >
                            {CUSTOM_FIELD_ENTITY_LABEL[key]} ({defs[key].filter((def) => !def.archivedAt).length})
                        </TabsTrigger>
                    ))}
                </TabsList>
                {CUSTOM_FIELD_ENTITIES.map((key) => {
                    const rows = sortDefs(defs[key]).filter((def) => showArchived || !def.archivedAt);
                    const archivedCount = defs[key].filter((def) => def.archivedAt).length;
                    return (
                        <TabsContent key={key} value={key} className="mt-4 space-y-3">
                            {archivedCount > 0 && (
                                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
                                    Show {archivedCount} archived
                                </label>
                            )}
                            {rows.length === 0 ? (
                                <Card className="rounded-lg border-border shadow-none">
                                    <EmptyState
                                        icon={SlidersHorizontal}
                                        title={`No custom fields for ${CUSTOM_FIELD_ENTITY_LABEL[key].toLowerCase()}`}
                                        description="A field here is a question the record's own columns do not ask — a preferred contact time, a facing direction, a source the team tracks."
                                        action={mayEdit ? <Button onClick={() => setDialog({ entity: key, def: null })}>Add field</Button> : undefined}
                                    />
                                </Card>
                            ) : (
                                <DataTable<CustomFieldDef, unknown>
                                    columns={columns}
                                    data={rows}
                                    getRowId={(row) => row.id}
                                    showColumnToggle={false}
                                    showPagination={false}
                                    bulkActions={(selected, _clear, keep) => (
                                        <BulkActions<CustomFieldDef>
                                            rows={selected}
                                            actions={bulkActions}
                                            label={(def) => def.label}
                                            onSettled={(outcome) => {
                                                keep(outcome.failed.map((failure) => failure.row));
                                                onChanged();
                                            }}
                                        />
                                    )}
                                />
                            )}
                        </TabsContent>
                    );
                })}
            </Tabs>

            {dialog && (
                <CustomFieldDialog
                    entity={dialog.entity}
                    def={dialog.def}
                    takenKeys={defs[dialog.entity].filter((def) => def.id !== dialog.def?.id).map((def) => def.key)}
                    nextOrder={defs[dialog.entity].reduce((max, def) => Math.max(max, def.sortOrder + 1), 0)}
                    onOpenChange={(open) => !open && setDialog(null)}
                    onSaved={onChanged}
                />
            )}

            <ConfirmDialog
                open={archiving !== null}
                onOpenChange={(open) => !open && !busy && setArchiving(null)}
                title={`Archive “${archiving?.label ?? ""}”?`}
                description="The field is asked no more, on the desk, in the apps or on the website. Every answer already given is kept, and the key stays taken."
                confirmLabel="Archive"
                destructive
                busy={busy}
                onConfirm={() => archiving && void archive(archiving)}
            />
        </div>
    );
}

export const FIELD_BULK_BLOCKED = {
    archive: "Archiving a field needs settings.edit.",
    restore: "Restoring a field needs settings.edit.",
    switches: "Changing where a field shows needs settings.edit.",
} as const;

const CHOICE_LABEL: Record<SwitchChoice, string> = { leave: "Leave as it is", on: "On", off: "Off" };

/** The custom fields desk's bulk actions — `settings.edit`, as every write on the desk is. */
function useFieldBulkActions(mayEdit: boolean): BulkAction<CustomFieldDef>[] {
    const [choices, setChoices] = React.useState<SwitchChoices>(LEAVE_ALL);
    const anyChosen = SHOW_ON_SWITCHES.some(({ key }) => choices[key] !== "leave");
    return [
        {
            key: "archive",
            label: "Archive",
            icon: Archive,
            blocked: mayEdit ? null : FIELD_BULK_BLOCKED.archive,
            skip: (def) => (def.archivedAt ? "already archived" : null),
            participle: "archived",
            noun: ["field", "fields"],
            phrase: (count) => `Archive ${count}`,
            description: "Each is asked no more, on the desk, in the apps or on the website. Every answer already given is kept, and the keys stay taken.",
            destructive: true,
            run: (def) => customFieldsService.archive(def.id),
        },
        {
            key: "restore",
            label: "Restore",
            icon: ArchiveRestore,
            blocked: mayEdit ? null : FIELD_BULK_BLOCKED.restore,
            skip: (def) => (def.archivedAt ? null : "not archived"),
            participle: "restored",
            noun: ["field", "fields"],
            phrase: (count) => `Restore ${count}`,
            description: "Each is asked again, with every answer it had.",
            run: (def) => customFieldsService.restore(def.id),
        },
        {
            key: "switches",
            label: "Set where they show",
            icon: Eye,
            blocked: mayEdit ? null : FIELD_BULK_BLOCKED.switches,
            skip: (def) => (def.archivedAt ? "archived" : !anyChosen ? null : switchPatch(def, choices) ? null : "already set"),
            participle: "changed",
            noun: ["field", "fields"],
            phrase: (count) => `Change ${count}`,
            onOpen: () => setChoices(LEAVE_ALL),
            ready: anyChosen,
            body: (
                <div className="grid gap-1.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {SHOW_ON_SWITCHES.map(({ key, label }) => (
                            <div key={key} className="grid gap-1.5">
                                <Label htmlFor={`cf-bulk-${key}`}>{label}</Label>
                                <Select value={choices[key]} onValueChange={(value) => setChoices((current) => ({ ...current, [key]: value as SwitchChoice }))}>
                                    <SelectTrigger id={`cf-bulk-${key}`} data-testid={`cf-bulk-${key}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(["leave", "on", "off"] as const).map((choice) => (
                                            <SelectItem key={choice} value={choice}>
                                                {CHOICE_LABEL[choice]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Only what you set changes; a field keeps every switch left as it is. The owner answers only where the field shows in the apps or on the website.</p>
                </div>
            ),
            run: (def) => customFieldsService.update(def.id, switchPatch(def, choices) ?? {}),
        },
    ];
}
