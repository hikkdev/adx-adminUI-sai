"use client";

import { SectionCard } from "@/components/adx/section-card";
import { useApiResource } from "@/lib/use-api-resource";
import { channelLabel, outreachService, replyRate, type ChannelFunnel, type ChannelFunnelRow, type LeadSide } from "@/services/leads";

/** "18 %" — a rate for the table, or "—". */
export function ratePct(rate: number | null): string {
    return rate === null ? "—" : `${Math.round(rate * 100)} %`;
}

/** The volume the outreach hub moved per channel over the window, beside the attribution the leads carry. */
export function ChannelFunnelCard({ side }: { side?: LeadSide | undefined }) {
    const resource = useApiResource<ChannelFunnel>(`leads:outreach:funnel:${side ?? "ALL"}`, () => outreachService.funnel({ side }));
    const data = resource.data;
    return (
        <SectionCard title="Outreach by channel" description="Last 30 days — what went out and what came back on each channel, and the moments the leads themselves attribute to it (D14).">
            {resource.loading && !data ? (
                <p className="text-sm text-muted-foreground">Counting…</p>
            ) : resource.error ? (
                <p className="text-sm text-danger">{resource.error}</p>
            ) : !data || data.channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has gone out yet — set a channel up under Settings › Integrations › Channels, or log a touch on a lead.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="channel-funnel">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 font-medium">Channel</th>
                                <th className="py-1 text-right font-medium">Sent</th>
                                <th className="py-1 text-right font-medium">Delivered</th>
                                <th className="py-1 text-right font-medium">Failed / skipped</th>
                                <th className="py-1 text-right font-medium">Inbound</th>
                                <th className="py-1 text-right font-medium">Replied</th>
                                <th className="py-1 text-right font-medium">First contact</th>
                                <th className="py-1 text-right font-medium">Engaged</th>
                                <th className="py-1 text-right font-medium">Converted</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.channels.map((row: ChannelFunnelRow) => (
                                <tr key={row.channel} className="border-t" data-testid={`channel-funnel-${row.channel}`}>
                                    <td className="py-1.5">{channelLabel(row.channel)}</td>
                                    <td className="py-1.5 text-right tabular-nums">{row.outbound}</td>
                                    <td className="py-1.5 text-right tabular-nums">{row.delivered}</td>
                                    <td className="py-1.5 text-right tabular-nums">{row.failed}</td>
                                    <td className="py-1.5 text-right tabular-nums">{row.inbound}</td>
                                    <td className="py-1.5 text-right tabular-nums">
                                        {row.replies} <span className="text-xs text-muted-foreground">({ratePct(replyRate(row))})</span>
                                    </td>
                                    <td className="py-1.5 text-right tabular-nums">{row.firstContact}</td>
                                    <td className="py-1.5 text-right tabular-nums">{row.engaged}</td>
                                    <td className="py-1.5 text-right tabular-nums">{row.converted}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </SectionCard>
    );
}
