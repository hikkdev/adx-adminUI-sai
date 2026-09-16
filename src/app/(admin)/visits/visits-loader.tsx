"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import { agentService, type AgentSummary } from "@/services/agents";
import { VISITS_PAGE_SIZE, visitsService, type VisitStatus, type VisitsPage } from "@/services/visits";
import { VisitsBoard } from "./visits-board";
import { VisitsOffline } from "./visits-offline";

/**
 * The dispatch board's data.
 *
 * Server shell + client loader, because `api-client` keeps its token in
 * localStorage and cannot run on the server.
 *
 * All three facets — the day, the status and the search — go to the API and
 * all three sit in the resource key, so a change refetches rather than
 * filtering the one page the console happens to be holding. The day matters
 * most: it is cut against the Indian calendar on the server, because the hosts
 * run UTC and a browser re-implementing the +05:30 boundary drifts. `counts`
 * comes back computed over the day *without* the status in force, which is
 * the only way each chip can say how many it would show.
 *
 * The roster is fetched separately and keyed without any facet, so it is read
 * once and not again on every filter change. It names the agent on each card
 * and fills the two agent pickers; if it fails the board still works and the
 * card falls back to the agent id it carries.
 */

/**
 * Today, in the calendar the server cuts the day by.
 *
 * `en-CA` is the locale whose short date is YYYY-MM-DD, which is what
 * `?date=` takes. Read once into state rather than on every render, and the
 * same on the server and the client unless the render straddles midnight IST.
 */
const todayIST = (): string =>
    new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());

export function VisitsLoader() {
    const live = isLive("visits");
    /** "" is every day. The board opens on today's. */
    const [date, setDate] = React.useState<string>(todayIST);
    const [status, setStatus] = React.useState<VisitStatus | "ALL">("ALL");
    const [q, setQ] = React.useState("");
    const settledQ = useDebounced(q.trim());

    const resource = useApiResource<VisitsPage>(
        `visits:board:${date}:${status}:${settledQ}:${live}`,
        () =>
            visitsService.board({
                ...(date ? { date } : {}),
                ...(status === "ALL" ? {} : { status: [status] }),
                ...(settledQ ? { q: settledQ } : {}),
                sort: "SOONEST",
                pageSize: VISITS_PAGE_SIZE,
            }),
    );

    const roster = useApiResource<AgentSummary[]>(`visits:agents:${live}`, () =>
        live ? agentService.list() : Promise.resolve([]),
    );

    if (!live) return <VisitsOffline />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => (
                <VisitsBoard
                    page={page}
                    date={date}
                    onDateChange={setDate}
                    today={todayIST}
                    status={status}
                    onStatusChange={setStatus}
                    q={q}
                    onQChange={setQ}
                    agents={roster.data ?? []}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
