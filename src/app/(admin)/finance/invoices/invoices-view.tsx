"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FilterChips } from "@/components/adx/filter-chips";
import { PageHeader } from "@/components/adx/page-header";
import { SimpleTable } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate, formatINR } from "@/lib/format";
import { INVOICE_STATUS_META, type Invoice, type InvoiceStatus } from "@/types";

interface InvoicesViewProps {
    invoices: Invoice[];
}

type ChipValue = "all" | Extract<InvoiceStatus, "paid" | "due" | "overdue">;

export function InvoicesView({ invoices }: InvoicesViewProps) {
    const [chip, setChip] = React.useState<ChipValue>("all");

    const countBy = (status: InvoiceStatus) =>
        invoices.filter((invoice) => invoice.status === status).length;

    const visible =
        chip === "all" ? invoices : invoices.filter((invoice) => invoice.status === chip);

    return (
        <div className="space-y-5">
            <PageHeader
                title="Invoices"
                subtitle="GST invoices raised to advertisers"
                actions={
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => toast.success("Invoices exported for accounting")}
                    >
                        Export CSV
                    </Button>
                }
            />

            <FilterChips<ChipValue>
                value={chip}
                onChange={setChip}
                chips={[
                    { value: "all", label: "All", count: invoices.length },
                    { value: "paid", label: "Paid", count: countBy("paid") },
                    { value: "due", label: "Due", count: countBy("due") },
                    { value: "overdue", label: "Overdue", count: countBy("overdue") },
                ]}
            />

            <SimpleTable<Invoice>
                rows={visible}
                rowKey={(invoice) => invoice.id}
                emptyMessage="No invoices in this state."
                columns={[
                    {
                        key: "invoice",
                        label: "Invoice",
                        render: (invoice) => (
                            <span className="font-medium text-foreground">{invoice.number}</span>
                        ),
                    },
                    {
                        key: "advertiser",
                        label: "Advertiser",
                        render: (invoice) => (
                            <span className="text-muted-foreground">{invoice.party}</span>
                        ),
                    },
                    {
                        key: "taxable",
                        label: "Taxable",
                        render: (invoice) => formatINR(invoice.amount),
                    },
                    {
                        key: "gst",
                        label: "GST 18%",
                        render: (invoice) => (
                            <span className="text-muted-foreground">{formatINR(invoice.gst)}</span>
                        ),
                    },
                    {
                        key: "total",
                        label: "Total",
                        render: (invoice) => (
                            <span className="font-medium">{formatINR(invoice.amount + invoice.gst)}</span>
                        ),
                    },
                    {
                        key: "due",
                        label: "Due",
                        render: (invoice) => (
                            <span className="text-muted-foreground">{formatDate(invoice.dueAt)}</span>
                        ),
                    },
                    {
                        key: "status",
                        label: "Status",
                        render: (invoice) => (
                            <StatusBadge status={INVOICE_STATUS_META[invoice.status]} />
                        ),
                    },
                ]}
            />
        </div>
    );
}
