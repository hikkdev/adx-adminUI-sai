"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { announcementsReadApi, announcementsService, type AnnouncementsPage } from "@/services/announcements";
import { CommsOffline } from "../comms-offline";
import { AnnouncementsView } from "./announcements-view";

const PAGE_SIZE = 20;

/** The history from `GET /announcements`, newest first; the composer's city picker is the shared combobox over `GET /geo/cities?q=`. */
export function AnnouncementsLoader() {
    const live = announcementsReadApi();
    const resource = useApiResource<AnnouncementsPage>(`comms:announcements:${live}`, async () => {
        if (!live) return { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {} };
        return announcementsService.list({ sort: "newest", pageSize: PAGE_SIZE });
    });

    if (!live) return <CommsOffline what="A broadcast" />;

    return (
        <ResourceBoundary resource={resource}>
            {(page) => <AnnouncementsView page={page} onChanged={resource.reload} />}
        </ResourceBoundary>
    );
}
