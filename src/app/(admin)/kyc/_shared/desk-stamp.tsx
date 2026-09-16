"use client";

import { StatusBadge } from "@/components/adx/status-badge";
import { formatDate } from "@/lib/format";
import { personLabel, RECORDED_VIA_LABEL, REQUEST_CHANNEL_LABEL } from "@/services/kyc";
import type { KycRecorded, KycRequest } from "@/types";

interface DeskStampProps {
    request: KycRequest | null;
    recorded: KycRecorded | null;
}

/**
 * The "Requested / Recorded by" column — Lot N: when the desk asked, who
 * and over which channel; and who put the documents on the row, from
 * where. An open ask (nothing submitted since) carries the pill.
 */
export function DeskStamp({ request, recorded }: DeskStampProps) {
    if (!request && !recorded) return <span className="text-muted-foreground">—</span>;
    return (
        <div className="space-y-0.5 text-xs">
            {request && (
                <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground" data-testid="desk-stamp-request">
                    <span>
                        Requested {formatDate(request.at)}
                        {personLabel(request.by) ? ` · ${personLabel(request.by)}` : ""} · {REQUEST_CHANNEL_LABEL[request.channel]}
                    </span>
                    {request.open && <StatusBadge status={{ label: "Awaiting the party", tone: "info" }} />}
                </p>
            )}
            {recorded && (
                <p className="text-muted-foreground" data-testid="desk-stamp-recorded">
                    {RECORDED_VIA_LABEL[recorded.via] ?? recorded.via}
                    {recorded.via !== "SELF" && personLabel(recorded.by) ? ` · ${personLabel(recorded.by)}` : ""}
                </p>
            )}
        </div>
    );
}
