"use client";

import * as React from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { isLive } from "@/lib/api-config";
import {
    agentApplicationService,
    buildApplicationsQuery,
    type AgentSide,
    type ApplicationsPage,
    type ApplicationsQuery,
} from "@/services/agent-applications";
import { ApplicationsQueue, type QueueChip } from "./applications-queue";

export const QUEUE_PAGE_SIZE = 25;

/** The chip → the query it stands for. "all" sends no stage at all. */
export function queryForChip(chip: QueueChip): Pick<ApplicationsQuery, "stage" | "group"> {
    switch (chip) {
        case "all":
            return {};
        case "IN_PROGRESS":
        case "WITH_DESK":
        case "CLOSED":
            return { group: chip };
        default:
            return { stage: chip };
    }
}

/**
 * The queue is the server's page: the chip, the side and the search all
 * refetch rather than cut the page in hand, so the counts on the chips
 * and the total under the table are the whole desk's, not one page's.
 */
export function ApplicationsLoader() {
    const live = isLive("agents");
    const [chip, setChip] = React.useState<QueueChip>("WITH_DESK");
    const [side, setSide] = React.useState<AgentSide | "all">("all");
    const [search, setSearch] = React.useState("");
    const [page, setPage] = React.useState(1);
    const q = useDebounced(search.trim(), 350);

    const query: ApplicationsQuery = React.useMemo(
        () => ({ ...queryForChip(chip), ...(side === "all" ? {} : { side }), ...(q ? { q } : {}), page, pageSize: QUEUE_PAGE_SIZE }),
        [chip, side, q, page],
    );
    const key = `agents:applications:${live}:${buildApplicationsQuery(query)}`;
    const resource = useApiResource<ApplicationsPage>(key, () => agentApplicationService.list(query));

    const pick = (next: QueueChip) => {
        setChip(next);
        setPage(1);
    };
    const pickSide = (next: AgentSide | "all") => {
        setSide(next);
        setPage(1);
    };
    const type = (next: string) => {
        setSearch(next);
        setPage(1);
    };

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <ApplicationsQueue
                    page={data}
                    chip={chip}
                    onChipChange={pick}
                    side={side}
                    onSideChange={pickSide}
                    search={search}
                    onSearchChange={type}
                    onPageChange={setPage}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
