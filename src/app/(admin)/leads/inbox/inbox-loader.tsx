"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { outreachService, type InboxPage, type OutreachChannel } from "@/services/leads";
import { LeadsOffline } from "../leads-offline";
import { InboxView } from "./inbox-view";

export interface InboxFilter {
    channel: OutreachChannel | "ALL";
    unanswered: boolean;
    page: number;
}

export function InboxLoader() {
    const live = isLive("leads");
    const [filter, setFilter] = React.useState<InboxFilter>({ channel: "ALL", unanswered: true, page: 1 });
    const resource = useApiResource<InboxPage>(`leads:inbox:${live}:${filter.channel}:${filter.unanswered}:${filter.page}`, () =>
        outreachService.inbox({ channel: filter.channel === "ALL" ? undefined : filter.channel, unanswered: filter.unanswered, page: filter.page, pageSize: 25 })
    );
    if (!live) return <LeadsOffline />;
    return <ResourceBoundary resource={resource}>{(data) => <InboxView data={data} filter={filter} onFilter={setFilter} />}</ResourceBoundary>;
}
