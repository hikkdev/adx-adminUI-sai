"use client";

import * as React from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { FEED_RUN_META, IMPORT_OUTCOME_META, LEAD_SIDE_LABEL, REFERRER_KIND_LABEL, SOURCE_KIND_LABEL, STAGE_META, feedReadiness, leadsService, type FeedRun, type FeedStatus, type LeadSide } from "@/services/leads";
import type { SourcesData } from "./sources-loader";

/**
 * LH3: the Sources desk — every door a lead comes through. The directory
 * feeds with their credential state, their quota for the day and the runs
 * they made (a run is asked for here: a side, a category, a city); the
 * inbound doors and the ad forms as sources with their quality; the
 * referrals with what each referrer earned.
 */
export function SourcesView({ data, onChanged }: { data: SourcesData; onChanged: () => void }) {
    const [running, setRunning] = React.useState<FeedStatus | null>(null);
    const [openRun, setOpenRun] = React.useState<FeedRun | null>(null);
    const nonFeeds = data.sources.filter((source) => source.kind !== "FEED");

    return (
        <div className="space-y-5" data-testid="lead-sources">
            <PageHeader
                title="Sources"
                subtitle="Where leads come from: the directory feeds ops runs, the doors a business walks through on its own, the referrals. Each source's quality is what the score reads."
                actions={
                    <Link href="/settings/leads-scoring" className="text-sm text-primary hover:underline">
                        Quality and quotas
                    </Link>
                }
            />

            <SectionCard title="Directory feeds" description="Google Places rides the maps server key; the partner feeds wait on a credential card under Integrations and a terms confirmation under Settings › Leads scoring › Sources.">
                <div className="divide-y">
                    {data.feeds.map((feed) => {
                        const readiness = feedReadiness(feed);
                        return (
                            <div key={feed.key} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid={`feed-${feed.key}`}>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-foreground">{feed.label}</span>
                                        <StatusBadge status={readiness} />
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{feed.configured ? (feed.reason ?? feed.needs) : feed.needs}</p>
                                    {feed.source && (
                                        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                            Quality {feed.source.quality} · {feed.source.quotaPerDay === null ? "no daily quota" : `${feed.source.usedToday} of ${feed.source.quotaPerDay} today`}
                                        </p>
                                    )}
                                </div>
                                <Button size="sm" variant={feed.ready ? "default" : "outline"} disabled={!feed.ready} onClick={() => setRunning(feed)} data-testid={`feed-run-${feed.key}`}>
                                    <Play className="mr-1.5 size-3.5" /> Run
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </SectionCard>

            <SectionCard title="Runs" description="What each run asked for and what came of it: the candidates the directory answered, the rows written, skipped (already ours, or on an account) and warned about.">
                {data.runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No run yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 font-medium">When</th>
                                <th className="py-1 font-medium">Feed</th>
                                <th className="py-1 font-medium">Ask</th>
                                <th className="py-1 text-right font-medium">Found</th>
                                <th className="py-1 text-right font-medium">Written</th>
                                <th className="py-1 text-right font-medium">Skipped</th>
                                <th className="py-1 font-medium">State</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.runs.map((run) => (
                                <tr key={run.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setOpenRun(run)} data-testid={`feed-run-row-${run.id}`}>
                                    <td className="py-1.5 text-xs text-muted-foreground">{formatDateTime(run.startedAt)}</td>
                                    <td className="py-1.5">{run.sourceLabel ?? run.sourceKey}</td>
                                    <td className="py-1.5">
                                        {run.category} · {LEAD_SIDE_LABEL[run.side]} · {run.city ?? "a drawn area"}
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">{run.candidates}</td>
                                    <td className="py-1.5 text-right tabular-nums">{run.imported}</td>
                                    <td className="py-1.5 text-right tabular-nums">{run.skipped}</td>
                                    <td className="py-1.5">
                                        <StatusBadge status={FEED_RUN_META[run.status]} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </SectionCard>

            <SectionCard title="Inbound and the other doors" description="The website form, the SITE poster, the agent's card, the lead-form ads, referrals, the desk and the imports — each a source with its own learned quality.">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {nonFeeds.map((source) => (
                        <div key={source.id} className="rounded-md border p-3" data-testid={`source-${source.key}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-foreground">{source.label}</span>
                                <StatusBadge status={{ label: source.isActive ? "On" : "Off", tone: source.isActive ? "success" : "neutral" }} />
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {SOURCE_KIND_LABEL[source.kind]} · quality {source.quality}
                            </p>
                        </div>
                    ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                    Doors: <code className="text-[11px]">POST /leads/inbound/web</code> (the website form), <code className="text-[11px]">/leads/inbound/site/:qrId</code> (a SITE poster), <code className="text-[11px]">/leads/inbound/agent/:qrId</code> (an agent card), <code className="text-[11px]">/leads/inbound/referral/:code</code>; the ad forms post to <code className="text-[11px]">/webhooks/leads/meta | google | linkedin</code> once their secrets are under Integrations.
                </p>
            </SectionCard>

            <SectionCard title="Referrals" description="Businesses a publisher, an advertiser or an agent referred from the app — and the credit paid when the referred business activated.">
                {data.referrals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nobody has referred a business yet.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 font-medium">Referred by</th>
                                <th className="py-1 font-medium">Business</th>
                                <th className="py-1 font-medium">Stage</th>
                                <th className="py-1 text-right font-medium">Credit</th>
                                <th className="py-1 font-medium">When</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.referrals.map((referral) => (
                                <tr key={referral.id} className="border-t" data-testid={`referral-${referral.id}`}>
                                    <td className="py-1.5">
                                        {referral.referrer?.name ?? referral.referrerId} <span className="text-xs text-muted-foreground">({REFERRER_KIND_LABEL[referral.referrerKind]})</span>
                                    </td>
                                    <td className="py-1.5">
                                        {referral.lead ? (
                                            <Link href={`/leads/${referral.leadId}`} className="text-primary hover:underline">
                                                {referral.lead.businessName}
                                            </Link>
                                        ) : (
                                            referral.leadId
                                        )}
                                    </td>
                                    <td className="py-1.5">{referral.lead ? <StatusBadge status={STAGE_META[referral.lead.stage]} /> : "—"}</td>
                                    <td className="py-1.5 text-right tabular-nums">{referral.creditAmount ? formatMoney(referral.creditAmount) : "—"}</td>
                                    <td className="py-1.5 text-xs text-muted-foreground">{formatDateTime(referral.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </SectionCard>

            <RunDialog feed={running} onOpenChange={(open) => !open && setRunning(null)} onRan={onChanged} />
            <RunReportDialog run={openRun} onOpenChange={(open) => !open && setOpenRun(null)} />
        </div>
    );
}

function RunDialog({ feed, onOpenChange, onRan }: { feed: FeedStatus | null; onOpenChange: (open: boolean) => void; onRan: () => void }) {
    const [side, setSide] = React.useState<LeadSide>("PUBLISHER");
    const [category, setCategory] = React.useState("");
    const [city, setCity] = React.useState("");
    const [limit, setLimit] = React.useState("50");
    const [busy, setBusy] = React.useState(false);
    const valid = category.trim().length > 0 && city.trim().length > 0 && /^\d+$/.test(limit) && Number(limit) >= 1 && Number(limit) <= 200;

    async function run() {
        if (!feed || !valid || busy) return;
        setBusy(true);
        try {
            const result = await leadsService.runFeed(feed.key, { side, category: category.trim(), city: city.trim(), limit: Number(limit) });
            toast.success(`${feed.label}: ${result.imported} lead${result.imported === 1 ? "" : "s"} written`, { description: `${result.candidates} found, ${result.skipped} skipped, ${result.warnings} with a warning.` });
            onOpenChange(false);
            onRan();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "The run did not go through.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={feed !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" data-testid="feed-run-dialog">
                <DialogHeader>
                    <DialogTitle>Run {feed?.label ?? "the feed"}</DialogTitle>
                    <DialogDescription>A category in a city, for one side. The rows ADX already holds are skipped; the rest go through the importer and are routed to the nearest agent with room.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-3">
                    <div className="space-y-1.5">
                        <Label>Side</Label>
                        <Select value={side} onValueChange={(value) => setSide(value as LeadSide)}>
                            <SelectTrigger aria-label="Side">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="PUBLISHER">Publisher leads</SelectItem>
                                <SelectItem value="ADVERTISER">Advertiser leads</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="feed-category">Category</Label>
                            <Input id="feed-category" value={category} onChange={(event) => setCategory(event.target.value)} placeholder="gym, cafe, clinic…" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="feed-city">City</Label>
                            <Input id="feed-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Bengaluru" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="feed-limit">At most</Label>
                        <Input id="feed-limit" inputMode="numeric" value={limit} onChange={(event) => setLimit(event.target.value)} className="w-24 tabular-nums" aria-invalid={!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 200 ? true : undefined} />
                        <p className="text-xs text-muted-foreground">1 to 200, under the source's daily quota. Google bills per request.</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button onClick={() => void run()} disabled={busy || !valid} data-testid="feed-run-confirm">
                        {busy ? "Running…" : "Run"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function RunReportDialog({ run, onOpenChange }: { run: FeedRun | null; onOpenChange: (open: boolean) => void }) {
    return (
        <Dialog open={run !== null} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl" data-testid="feed-run-report">
                <DialogHeader>
                    <DialogTitle>
                        {run?.sourceLabel ?? run?.sourceKey} · {run?.category} · {run?.city ?? "a drawn area"}
                    </DialogTitle>
                    <DialogDescription>
                        {run ? `${run.candidates} found · ${run.imported} written · ${run.skipped} skipped · ${run.warnings} warned${run.report ? ` · ${run.report.alreadyHeld} already ours` : ""}${run.error ? ` · ${run.error}` : ""}` : ""}
                    </DialogDescription>
                </DialogHeader>
                {run?.report?.rows.length ? (
                    <div className="max-h-[50vh] overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-muted-foreground">
                                    <th className="py-1 font-medium">Row</th>
                                    <th className="py-1 font-medium">Outcome</th>
                                    <th className="py-1 font-medium">Ref</th>
                                    <th className="py-1 font-medium">Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {run.report.rows.map((row) => (
                                    <tr key={row.row} className="border-t">
                                        <td className="py-1 tabular-nums">{row.row}</td>
                                        <td className="py-1">
                                            <StatusBadge status={IMPORT_OUTCOME_META[row.outcome] ?? { label: row.outcome, tone: "neutral" }} />
                                        </td>
                                        <td className="py-1 font-mono text-xs">{row.ref ?? "—"}</td>
                                        <td className="py-1 text-xs text-muted-foreground">{row.message}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{run?.status === "QUOTA" ? "The source's quota for the day was already spent." : run?.error ?? "No rows in this run."}</p>
                )}
            </DialogContent>
        </Dialog>
    );
}
