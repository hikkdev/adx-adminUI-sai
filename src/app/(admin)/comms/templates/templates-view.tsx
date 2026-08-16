"use client";

import * as React from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/adx/page-header";
import { FieldList } from "@/components/adx/simple-table";

const templates = ["Payout due reminder", "KYC approved", "Order assigned", "Dispute update"];
const channels = ["Email", "SMS", "Push"];

const mergeVariables = [
    { token: "{{publisher_name}}", helper: "Registered business name of the recipient" },
    { token: "{{order_id}}", helper: "ADX order reference for this payout" },
    { token: "{{amount}}", helper: "Net payout in rupees, after commission and TDS" },
    { token: "{{due_date}}", helper: "Date the payout is released to the bank" },
];

export function TemplatesView() {
    const [template, setTemplate] = React.useState(templates[0]);
    const [channel, setChannel] = React.useState("Email");
    const [subject, setSubject] = React.useState("Payout for {{order_id}} is on its way");
    const [body, setBody] = React.useState(
        "Hello {{publisher_name}},\n\nYour payout of {{amount}} for {{order_id}} releases on {{due_date}}. It settles to your verified bank account within two working days."
    );

    return (
        <div className="space-y-5">
            <PageHeader
                title="Notification templates"
                subtitle="Transactional messages with live merge variables"
                actions={
                    <>
                        <Button
                            variant="outline"
                            className="bg-card"
                            onClick={() => toast.success("Test sent to priya.rao@adx.co.in")}
                        >
                            Send test
                        </Button>
                        <Button onClick={() => toast.success(`"${template}" published`)}>
                            Publish template
                        </Button>
                    </>
                }
            />

            <div className="grid gap-4 xl:grid-cols-2">
                {/* Editor */}
                <div className="space-y-4">
                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Template
                        </h3>
                        <div className="mt-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label>Template name</Label>
                                <Select value={template} onValueChange={setTemplate}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map((name) => (
                                            <SelectItem key={name} value={name}>
                                                {name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Channel</Label>
                                <div className="flex gap-1.5">
                                    {channels.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => setChannel(option)}
                                            className={cn(
                                                "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                                                channel === option
                                                    ? "border-foreground bg-foreground text-background"
                                                    : "bg-card text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="tpl-subject">Subject line</Label>
                                <Input
                                    id="tpl-subject"
                                    value={subject}
                                    onChange={(event) => setSubject(event.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="tpl-body">Body</Label>
                                <Textarea
                                    id="tpl-body"
                                    value={body}
                                    onChange={(event) => setBody(event.target.value)}
                                    className="min-h-36 resize-none font-mono text-xs"
                                />
                            </div>
                        </div>
                    </Card>

                    <Card className="rounded-lg border-border p-5 shadow-none">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Merge variables
                        </h3>
                        <ul className="mt-3 divide-y">
                            {mergeVariables.map((variable) => (
                                <li key={variable.token} className="flex items-center gap-3 py-2.5">
                                    <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {variable.token}
                                    </code>
                                    <span className="text-xs text-muted-foreground">{variable.helper}</span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </div>

                {/* Live preview */}
                <Card className="h-fit rounded-lg border-border p-5 shadow-none">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Live preview
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">Rendered with sample values</p>

                    <div className="mt-4 overflow-hidden rounded-lg border">
                        <div className="border-b bg-muted/50 px-4 py-2.5">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Subject
                            </p>
                            <p className="text-sm font-medium text-foreground">
                                Payout for ORD-20482 is on its way
                            </p>
                        </div>
                        <div className="space-y-4 p-5">
                            <p className="text-base font-semibold tracking-tight">ADX.</p>
                            <p className="text-sm text-foreground">Hello Sharma Hoardings,</p>
                            <p className="text-sm text-muted-foreground">
                                Your payout of ₹1,24,500 for ORD-20482 releases on 28 Jun 2026. It
                                settles to your verified bank account within two working days.
                            </p>
                            <FieldList
                                items={[
                                    ["Order", "ORD-20482"],
                                    ["Net amount", "₹1,24,500"],
                                    ["Release date", "28 Jun 2026"],
                                    ["Settles to", "HDFC Bank ••4412"],
                                ]}
                            />
                            <Button size="sm" className="h-8">
                                View payout details
                            </Button>
                            <p className="border-t pt-3 text-xs text-muted-foreground">
                                Payments settle within two working days. The ADX payouts team.
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
