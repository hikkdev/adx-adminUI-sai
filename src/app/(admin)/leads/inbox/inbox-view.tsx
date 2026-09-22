"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/adx/empty-state";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime } from "@/lib/format";
import { channelLabel, inboxChips, LEAD_SIDE_LABEL, messagePreview, type InboxPage, type InboxRow, type OutreachChannel } from "@/services/leads";
import type { InboxFilter } from "./inbox-loader";

/**
 * LH6: the inbound queue — every conversation a lead wrote on, by channel,
 * the unanswered ones first. A row opens the lead's page, where the reply
 * goes out on the same thread.
 */
export function InboxView({ data, filter, onFilter }: { data: InboxPage; filter: InboxFilter; onFilter: (filter: InboxFilter) => void }) {
    const total = Object.values(data.byChannel).reduce((sum, n) => sum + n, 0);
    const chips = [{ value: "ALL", label: `All · ${total}` }, ...inboxChips(data.byChannel)];
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    return (
        <div className="space-y-5" data-testid="inbox-desk">
            <PageHeader
                title="Inbox"
                subtitle="Every lead that wrote to us — a WhatsApp, a DM, a comment, a missed call, a form — by channel. A reply on the same thread stops the lead's sequence and moves it to Engaged."
                actions={
                    <Button size="sm" variant={filter.unanswered ? "default" : "outline"} onClick={() => onFilter({ ...filter, unanswered: !filter.unanswered, page: 1 })} data-testid="inbox-unanswered">
                        {filter.unanswered ? "Unanswered" : "Everything"}
                    </Button>
                }
            />
            <FilterChips chips={chips} value={filter.channel} onChange={(value) => onFilter({ ...filter, channel: value as OutreachChannel | "ALL", page: 1 })} />
            <SectionCard title={`${data.total} ${data.total === 1 ? "thread" : "threads"}`} description={filter.unanswered ? "Waiting on a reply from us." : "Every thread with something from the lead."}>
                {data.items.length === 0 ? (
                    <EmptyState icon={Inbox} title="Nothing waiting" description={filter.unanswered ? "Every thread has been answered." : "No lead has written on this channel yet."} className="py-12" />
                ) : (
                    <SimpleTable<InboxRow>
                        rows={data.items}
                        rowKey={(row) => row.id}
                        columns={[
                            {
                                key: "lead",
                                label: "Lead",
                                render: (row) => (
                                    <Link href={`/leads/${row.leadId}`} className="font-medium text-primary hover:underline" data-testid={`inbox-open-${row.leadId}`}>
                                        {row.lead.businessName}
                                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                                            {LEAD_SIDE_LABEL[row.lead.side]}
                                            {row.lead.city ? ` · ${row.lead.city}` : ""}
                                        </span>
                                    </Link>
                                ),
                            },
                            { key: "channel", label: "Channel", render: (row) => <StatusBadge status={{ label: channelLabel(row.channel), tone: row.windowOpen ? "success" : "neutral" }} /> },
                            { key: "last", label: "Last", render: (row) => <span className="text-sm text-foreground">{row.last ? messagePreview(row.last) : "—"}</span> },
                            { key: "when", label: "They wrote", render: (row) => (row.lastInboundAt ? formatDateTime(row.lastInboundAt) : "—") },
                            { key: "state", label: "", render: (row) => (row.unanswered ? <StatusBadge status={{ label: "Unanswered", tone: "warning" }} /> : <StatusBadge status={{ label: "Answered", tone: "neutral" }} />) },
                        ]}
                    />
                )}
                {pages > 1 ? (
                    <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                        <Button size="sm" variant="outline" disabled={filter.page <= 1} onClick={() => onFilter({ ...filter, page: filter.page - 1 })}>
                            Newer
                        </Button>
                        <span>
                            Page {data.page} of {pages}
                        </span>
                        <Button size="sm" variant="outline" disabled={filter.page >= pages} onClick={() => onFilter({ ...filter, page: filter.page + 1 })}>
                            Older
                        </Button>
                    </div>
                ) : null}
            </SectionCard>
        </div>
    );
}
