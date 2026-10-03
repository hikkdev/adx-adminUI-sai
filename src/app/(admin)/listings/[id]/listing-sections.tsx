"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MiniMap } from "@/components/adx/mini-map";
import { PrivateFileLink } from "@/components/adx/private-file";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList, SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { DOCUMENT_STATUS_META } from "@/services/listing-review";
import {
    LISTING_FIELDS,
    LISTING_FIELD_SECTION_LABEL,
    NOT_STATED,
    contentStanceMeta,
    demographicsRows,
    documentKindLabel,
    extraAnswerRows,
    fieldText,
    fieldsIn,
    listingField,
    plainLabel,
    type ListingBlockedDateRecord,
    type ListingDocumentRecord,
    type ListingField,
    type ListingFieldSection,
    type ListingRecord,
} from "@/services/listing-record";
import type { AdminListingDetail } from "@/services/listings";

/**
 * The listing page's Overview sections (3 Oct 2026).
 *
 * Every section draws its columns from `LISTING_FIELDS`, so whatever the
 * listing stores is on the page — an empty one reads "Not stated", which
 * tells the desk the question was there and nobody answered it. Cards sit
 * two to a row and the last one of an odd count takes the whole row, so no
 * row is ever half empty; prose (a description, a note) runs under the
 * short label/value rows rather than squeezed to the right of a label.
 */

/** What a `ref` column needs that the record itself does not carry. */
export interface FieldContext {
    publisherName: string | null;
    publisherId: string | null;
    agentLabel: string | null;
    mediaTypeName: string | null;
}

export const contextOf = (listing: AdminListingDetail): FieldContext => ({
    publisherName: listing.publisherName,
    publisherId: listing.publisherId,
    agentLabel: listing.agentDisplayId,
    mediaTypeName: listing.mediaType?.name ?? null,
});

/** Two cards to a row; the last of an odd count takes the row, so none is half empty. Stacks on a narrow screen. */
export function TwoColumn({ children, className }: { children: React.ReactNode; className?: string }) {
    const items = React.Children.toArray(children).filter(Boolean);
    return (
        <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
            {items.map((child, index) => (
                <div
                    key={(React.isValidElement(child) && child.key) || index}
                    className={cn("min-w-0 [&>*]:h-full", items.length % 2 === 1 && index === items.length - 1 && "lg:col-span-2")}
                >
                    {child}
                </div>
            ))}
        </div>
    );
}

/** A column's value as the page draws it — a link, a file, a list of bands — or its words. */
export function fieldValue(field: ListingField, record: ListingRecord, context: FieldContext): React.ReactNode {
    const value = record.columns[field.key];
    if (field.format === "file" && typeof value === "string" && value) {
        return (
            <PrivateFileLink href={value} fallbackError={`${field.label} could not be opened.`} className="text-primary underline-offset-4 hover:underline">
                Open the file
            </PrivateFileLink>
        );
    }
    if (field.key === "publisherId" && context.publisherId) {
        return (
            <Link href={`/publishers/${context.publisherId}`} className="text-primary underline-offset-4 hover:underline">
                {context.publisherName ?? "The publisher"}
            </Link>
        );
    }
    return fieldText(field, record, context);
}

/** Prose columns run under the rows, the full width of the card. */
const PROSE = new Set(["longText", "demographics"]);

/** One card of columns: the short ones as label/value rows, the prose under them, then anything the section adds. */
export function FieldsCard({
    title,
    description,
    fields,
    record,
    context,
    leadRows = [],
    extraRows = [],
    actions,
    children,
    className,
}: {
    title: string;
    description?: string;
    fields: ListingField[];
    record: ListingRecord;
    context: FieldContext;
    /** Rows the section works out rather than reads, drawn first (`leadRows`) or after the columns (`extraRows`). */
    leadRows?: [string, React.ReactNode][];
    extraRows?: [string, React.ReactNode][];
    actions?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
}) {
    const rows = fields.filter((field) => !PROSE.has(field.format));
    const prose = fields.filter((field) => PROSE.has(field.format));
    return (
        <SectionCard title={title} description={description} actions={actions} className={className}>
            <div className="space-y-4">
                {leadRows.length + rows.length + extraRows.length > 0 ? (
                    <FieldList items={[...leadRows, ...rows.map((field): [string, React.ReactNode] => [field.label, fieldValue(field, record, context)]), ...extraRows]} />
                ) : null}
                {prose.map((field) => (
                    <ProseBlock key={field.key} label={field.label}>
                        {field.format === "demographics" ? <Demographics value={record.columns[field.key]} /> : fieldText(field, record, context)}
                    </ProseBlock>
                ))}
                {children}
            </div>
        </SectionCard>
    );
}

export function ProseBlock({ label, children }: { label: string; children: React.ReactNode }) {
    const empty = children === NOT_STATED;
    return (
        <div className="space-y-1 border-t pt-3 first:border-t-0 first:pt-0">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {/* Formatted as typed and never cut short: line breaks kept, long words wrapped. */}
            <div className={cn("whitespace-pre-wrap break-words text-sm", empty ? "text-muted-foreground" : "text-foreground")}>{children}</div>
        </div>
    );
}

function Demographics({ value }: { value: unknown }) {
    const rows = demographicsRows(value);
    if (rows.length === 0) return <>{NOT_STATED}</>;
    return (
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2" data-testid="demographics">
            {rows.map(([label, v]) => (
                <div key={label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

/* ------------------------------------------------------------------ */
/* About                                                               */
/* ------------------------------------------------------------------ */

export function AboutCard({ record, context }: { record: ListingRecord; context: FieldContext }) {
    const fields = fieldsIn("about").filter((field) => field.key !== "title");
    return (
        <FieldsCard
            title="About"
            description="What the publisher says the spot is, in their words."
            fields={fields}
            record={record}
            context={context}
        >
            <ProseBlock label="Content rules (what may and may not run here)">
                {record.contentRules.length === 0 ? (
                    NOT_STATED
                ) : (
                    <ul className="flex flex-wrap gap-1.5 whitespace-normal" data-testid="content-rules">
                        {record.contentRules.map((rule) => (
                            <li key={rule.category.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs">
                                {rule.category.name}
                                <StatusBadge status={contentStanceMeta(rule.stance)} />
                            </li>
                        ))}
                    </ul>
                )}
            </ProseBlock>
            <ProseBlock label="Amenities">
                <span className="text-muted-foreground">Not asked — no listing form collects amenities, and the platform has nowhere to keep them.</span>
            </ProseBlock>
        </FieldsCard>
    );
}

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

export function LocationCard({ record, context, title }: { record: ListingRecord; context: FieldContext; title: string }) {
    const latitude = record.columns["latitude"];
    const longitude = record.columns["longitude"];
    const pinned = typeof latitude === "number" && typeof longitude === "number" && Number.isFinite(latitude) && Number.isFinite(longitude);
    // The pin replaces the raw pair; the pair stays in "All recorded data".
    const fields = fieldsIn("location").filter((field) => field.key !== "latitude" && field.key !== "longitude");
    return (
        <FieldsCard title="Location" fields={fields} record={record} context={context} extraRows={pinned ? [] : [["Map pin", "Not dropped"]]}>
            {pinned ? <MiniMap latitude={latitude} longitude={longitude} title={title} /> : null}
        </FieldsCard>
    );
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

/** Blocked ranges that have not ended yet, soonest first, then the past ones. */
export function splitBlocks(blocks: readonly ListingBlockedDateRecord[], today: string): { upcoming: ListingBlockedDateRecord[]; past: ListingBlockedDateRecord[] } {
    const upcoming = blocks.filter((block) => block.to.slice(0, 10) >= today);
    const past = blocks.filter((block) => block.to.slice(0, 10) < today).reverse();
    return { upcoming, past };
}

const blockRange = (block: ListingBlockedDateRecord): string =>
    block.from.slice(0, 10) === block.to.slice(0, 10) ? formatDate(block.from) : `${formatDate(block.from)} – ${formatDate(block.to)}`;

export function AvailabilityCard({ record, context, today }: { record: ListingRecord; context: FieldContext; today: string }) {
    const { upcoming, past } = splitBlocks(record.blockedDates, today);
    return (
        <FieldsCard title="Availability" fields={fieldsIn("availability")} record={record} context={context}>
            <ProseBlock label={`Blocked dates (${record.blockedDates.length})`}>
                {record.blockedDates.length === 0 ? (
                    "None — the publisher has not taken any day off the market."
                ) : (
                    <ul className="space-y-1 whitespace-normal" data-testid="blocked-dates">
                        {[...upcoming, ...past].map((block) => (
                            <li key={block.id} className={cn("flex flex-wrap items-baseline justify-between gap-2", past.includes(block) && "text-muted-foreground")}>
                                <span className="font-medium">{blockRange(block)}</span>
                                <span className="text-xs text-muted-foreground">
                                    {[block.reason, block.createdBy?.name ? `by ${block.createdBy.name}` : null, past.includes(block) ? "past" : null].filter(Boolean).join(" · ") || "No reason given"}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </ProseBlock>
        </FieldsCard>
    );
}

/* ------------------------------------------------------------------ */
/* Rights and documents                                                */
/* ------------------------------------------------------------------ */

export function DocumentsTable({ documents }: { documents: ListingDocumentRecord[] }) {
    return (
        <SimpleTable<ListingDocumentRecord>
            rows={documents}
            rowKey={(document) => document.id}
            emptyMessage="No documents filed."
            className="shadow-none"
            columns={[
                {
                    key: "kind",
                    label: "Document",
                    render: (document) => (
                        <PrivateFileLink href={document.url} fallbackError={`${documentKindLabel(document.kind)} could not be opened.`} className="font-medium text-primary underline-offset-4 hover:underline">
                            {documentKindLabel(document.kind)}
                        </PrivateFileLink>
                    ),
                },
                { key: "status", label: "Status", render: (document) => <StatusBadge status={DOCUMENT_STATUS_META[document.status]} /> },
                { key: "expires", label: "Runs out", render: (document) => (document.expiresAt ? formatDate(document.expiresAt) : "—") },
                {
                    key: "reviewed",
                    label: "Checked",
                    render: (document) =>
                        document.reviewedAt ? `${formatDate(document.reviewedAt)}${document.reviewedBy?.name ? ` by ${document.reviewedBy.name}` : ""}` : `Filed ${formatDate(document.submittedAt)}`,
                },
            ]}
        />
    );
}

export function RightsCard({ record, context }: { record: ListingRecord; context: FieldContext }) {
    const rejected = record.documents.filter((document) => document.status === "REJECTED" && document.rejectionReason);
    return (
        <FieldsCard
            title="Rights and documents"
            description="The right to sell this space, when it runs out, and the papers behind it."
            fields={fieldsIn("rights")}
            record={record}
            context={context}
        >
            <DocumentsTable documents={record.documents} />
            {rejected.map((document) => (
                <p key={document.id} className="rounded-md bg-danger/10 p-2 text-xs text-danger">
                    {documentKindLabel(document.kind)} rejected: {document.rejectionReason}
                </p>
            ))}
        </FieldsCard>
    );
}

/* ------------------------------------------------------------------ */
/* Other answers                                                       */
/* ------------------------------------------------------------------ */

/**
 * 3 Oct 2026: what a listing form asked that has no column of its own — a
 * question added on the flow board, say — kept on the listing as
 * `extraAnswers` rather than dropped. Each is the question as it was worded
 * and the answer given. Draws nothing when there are none, the way the
 * custom fields card does; the column still reads "Not stated" in "All
 * recorded data".
 */
export function OtherAnswersCard({ record }: { record: ListingRecord }) {
    const rows = extraAnswerRows(record.columns["extraAnswers"]);
    if (rows.length === 0) return null;
    return (
        <SectionCard title="Other answers" description="Questions the listing form asked that have no place of their own on the listing, with the answers given.">
            <FieldList items={rows} />
        </SectionCard>
    );
}

/* ------------------------------------------------------------------ */
/* All recorded data                                                   */
/* ------------------------------------------------------------------ */

/** Every column, by section, then any the register has no label for yet — in plain words, never the column's own name. */
export function allRecordedRows(record: ListingRecord, context: FieldContext): { section: string; rows: [string, React.ReactNode][] }[] {
    const sections = new Map<ListingFieldSection, [string, React.ReactNode][]>();
    for (const field of LISTING_FIELDS) {
        const rows = sections.get(field.section) ?? [];
        rows.push([field.label, fieldValue(field, record, context)]);
        sections.set(field.section, rows);
    }
    const out = [...sections.entries()].map(([section, rows]) => ({ section: LISTING_FIELD_SECTION_LABEL[section], rows }));
    const unlabelled = Object.keys(record.columns).filter((key) => !listingField(key));
    if (unlabelled.length > 0) {
        out.push({
            section: "Not yet labelled",
            rows: unlabelled.map((key): [string, React.ReactNode] => {
                const value = record.columns[key];
                return [plainLabel(key), value === null || value === undefined || value === "" ? NOT_STATED : typeof value === "object" ? JSON.stringify(value) : String(value)];
            }),
        });
    }
    const custom = record.customFields.map((field): [string, React.ReactNode] => [
        `${field.label}${field.archived ? " (retired question)" : ""}`,
        field.value === null || field.value === undefined || field.value === "" ? NOT_STATED : typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value),
    ]);
    if (custom.length) out.push({ section: "Custom fields", rows: custom });
    const counts = record.counts;
    out.push({
        section: "Rows on record",
        rows: [
            ["Orders", counts.orders],
            ["Campaign lines", counts.campaignSpots],
            ["Photographs", counts.photos],
            ["Documents", counts.documents],
            ["Site verifications", counts.verifications],
            ["Claims", counts.claims],
            ["Compliance cases", counts.complianceCases],
            ["Earnings holds", counts.earningsHolds],
            ["Disputes", counts.disputes],
            ["Price locks", counts.priceLocks],
            ["Price approvals", counts.priceApprovals],
            ["Blocked date ranges", counts.blockedDates],
            ["Days of earnings accrued", counts.earningAccruals],
            ["Sponsored placements", counts.boosts],
        ].map(([label, count]): [string, React.ReactNode] => [String(label), String(count)]),
    });
    return out;
}

export function AllRecordedData({ record, context }: { record: ListingRecord; context: FieldContext }) {
    const [open, setOpen] = React.useState(false);
    const sections = open ? allRecordedRows(record, context) : [];
    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <SectionCard
                title="All recorded data"
                description="Every column ADX keeps on this listing, whatever the sections above show — nothing stored is hidden by the layout."
                actions={
                    <CollapsibleTrigger className="inline-flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm font-medium">
                        {open ? "Hide" : "Show all"}
                        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                    </CollapsibleTrigger>
                }
            >
                <CollapsibleContent>
                    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2" data-testid="all-recorded-data">
                        {sections.map(({ section, rows }) => (
                            <div key={section}>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</p>
                                <FieldList items={rows} />
                            </div>
                        ))}
                    </div>
                </CollapsibleContent>
                {!open ? <p className="text-sm text-muted-foreground">{LISTING_FIELDS.length} columns, the custom fields and the counts of every history. Closed until asked for.</p> : null}
            </SectionCard>
        </Collapsible>
    );
}

/** A plain dated line — "2 Oct 2026, 4:05 pm by Ops Desk". */
export const byLine = (at: string | null, who: { name: string | null } | null): string =>
    at ? `${formatDateTime(at)}${who?.name ? ` by ${who.name}` : ""}` : "—";
