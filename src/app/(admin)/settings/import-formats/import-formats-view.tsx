"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DownloadTemplateButton, FormatGuideBody } from "@/components/adx/party-import/format-guide-panel";
import type { FormatKind, ImportFormat } from "@/services/party-imports";

/**
 * Where each kind's file is uploaded on the console — the reference page
 * links every guide to its import screen. Leads and the bank statement
 * import from a dialog on their desk; market data from its own screen.
 */
export const IMPORT_SCREEN: Record<FormatKind, { label: string; href: string }> = {
    publishers: { label: "Publishers / Import", href: "/publishers/import" },
    advertisers: { label: "Advertisers / Import", href: "/advertisers/import" },
    agents: { label: "Agents / Import", href: "/agents/import" },
    "print-partners": { label: "Print partners / Import", href: "/print-partners/import" },
    employees: { label: "Employees / Import", href: "/employees/import" },
    listings: { label: "Listings / Import / Listings", href: "/listings/import?kind=listings" },
    "rate-card": { label: "Listings / Import / Rate card", href: "/listings/import?kind=rate-card" },
    leads: { label: "Leads / Import leads", href: "/leads" },
    "market-data": { label: "Pricing / Market data", href: "/pricing/market-data" },
    "finance-reconciliation": { label: "Finance / Reconciliation / Import a statement", href: "/finance/reconciliation" },
};

/**
 * Import formats — package U. Every kind the platform imports, one guide
 * each: what the file is for, how many columns and which, what each
 * takes, the rules the validator applies, and a template to start from.
 * The guide is the server's (kept beside each validator and pinned to it
 * by a contract test), so this page cannot drift from what an upload is
 * held to.
 */
export function ImportFormatsView({ formats }: { formats: ImportFormat[] }) {
    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import formats</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    The file format of every import on the platform: {formats.length} kinds. Each import screen carries its own guide; this is all of them in one
                    place.
                </p>
            </div>

            <Card className="rounded-lg border-border shadow-none">
                <nav aria-label="Import kinds" className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 py-3 text-sm">
                    {formats.map((format) => (
                        <a key={format.kind} href={`#format-${format.kind}`} className="text-primary underline-offset-4 hover:underline">
                            {format.title}
                        </a>
                    ))}
                </nav>
            </Card>

            {formats.map((format) => {
                const screen = IMPORT_SCREEN[format.kind];
                return (
                    <Card key={format.kind} id={`format-${format.kind}`} className="scroll-mt-20 overflow-hidden rounded-lg border-border shadow-none" data-testid={`format-${format.kind}`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                            <div className="min-w-0">
                                <h2 className="text-sm font-semibold text-foreground">{format.title}</h2>
                                {screen && (
                                    <Link href={screen.href} className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
                                        {screen.label}
                                        <ArrowUpRight className="size-3" aria-hidden />
                                    </Link>
                                )}
                            </div>
                            <DownloadTemplateButton kind={format.kind} />
                        </div>
                        <FormatGuideBody format={format} />
                    </Card>
                );
            })}
        </div>
    );
}
