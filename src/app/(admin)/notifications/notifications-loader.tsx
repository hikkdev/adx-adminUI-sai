"use client";

import * as React from "react";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import {
    notificationService,
    notificationsReadApi,
    type NotificationFeed,
    type NotificationType,
    type PreferenceRow,
} from "@/services/notifications";
import { NotificationsView } from "./notifications-view";

/** A page of the centre. The feed takes `offset` too; nothing here pages yet. */
const PAGE_SIZE = 100;

export interface NotificationsFacets {
    /** The frame's "Read state" facet: `unreadOnly` on the wire. */
    unreadOnly: boolean;
    type: NotificationType | "ALL";
}

interface Loaded {
    feed: NotificationFeed;
    /** Every kind on every channel. Null when the read failed; the card says so. */
    preferences: PreferenceRow[] | null;
}

/**
 * DR 10's notification centre (`5102:39414`), live.
 *
 * Every facet is a `?` the server cuts: the read-state chip is `unreadOnly`,
 * the type chips are `type`, so changing one refetches rather than hiding
 * rows a capped page never held. The Preferences card is read beside the
 * feed and written cell by cell.
 */
export function NotificationsLoader() {
    const live = notificationsReadApi();
    const [facets, setFacets] = React.useState<NotificationsFacets>({ unreadOnly: true, type: "ALL" });

    const resource = useApiResource<Loaded>(
        `notifications:centre:${live}:${facets.unreadOnly}:${facets.type}`,
        async () => {
            const [feed, preferences] = await Promise.all([
                notificationService.list({
                    limit: PAGE_SIZE,
                    unreadOnly: facets.unreadOnly,
                    type: facets.type === "ALL" ? undefined : facets.type,
                }),
                notificationService.preferences().catch(() => null),
            ]);
            return { feed, preferences };
        }
    );

    if (!live) {
        return (
            <div className="space-y-5">
                <PageHeader title="Notifications" subtitle="What ADX has told you." />
                <EmptyState
                    icon={PlugZap}
                    title="Notifications read the API"
                    description="The feed and the Preferences card are the signed-in operator's own, read from the ADX backend. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at it."
                />
            </div>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <NotificationsView
                    feed={data.feed}
                    preferences={data.preferences}
                    facets={facets}
                    onFacetsChange={setFacets}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}
