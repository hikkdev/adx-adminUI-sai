"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { isLive } from "@/lib/api-config";
import { usePresence } from "@/lib/use-presence";
import {
    INBOX_STREAM_EVENTS,
    inboxEventsUrl,
    liveChatService,
    liveFacetsFromSearch,
    liveFacetsSearch,
    openStream,
    type CannedReply,
    type InboxStreamEvent,
    type LiveInboxFacets,
    type LiveInboxPage,
} from "@/services/live-chat";
import { LiveDesk } from "./live-desk";

/**
 * The live desk — `/support/live`, Lot I.
 *
 * The inbox is `GET /support/live/inbox`, and it is kept honest by the desk's
 * own stream rather than by a poll: `GET /support/live/inbox/events` carries a
 * new chat, a message on one, and a first-response breach, and every one of
 * those is a reason to re-read the list. The re-read is what actually updates
 * the rows — the stream says "something moved", the list contract says what it
 * moved to — so a missed event costs a few seconds of staleness rather than a
 * wrong row. Because the stream token is single use, the reconnect is ours
 * (see `openStream`), and a reconnect re-reads too.
 *
 * The two facets — `?mine=1`, `?unassigned=1` — live in the URL like every
 * other desk's, so a filtered inbox survives a reload and can be handed to
 * somebody as a link. They sit in the resource key, so a change refetches
 * with the list contract's own `mine` / `unassigned` rather than filtering
 * the page the console happens to hold.
 *
 * The canned replies are read once beside it: the picker inside the composer
 * needs them, and they change on the scale of weeks, not seconds.
 */
export function LiveLoader() {
    const live = isLive("support");
    const presence = usePresence();
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const facets = liveFacetsFromSearch(params);

    const setFacets = React.useCallback(
        (next: LiveInboxFacets) => {
            const search = liveFacetsSearch(next);
            router.replace(search ? `${pathname}?${search}` : pathname);
        },
        [pathname, router],
    );

    const inbox = useApiResource<LiveInboxPage>(
        `support:live:inbox:${live}:${facets.mine}:${facets.unassigned}`,
        () => liveChatService.inbox(facets),
    );
    const canned = useApiResource<CannedReply[]>(`support:live:canned:${live}`, () =>
        live ? liveChatService.canned() : Promise.resolve([]),
    );

    /* Kept in a ref so the stream effect — which must run once and hold one
       socket — does not re-open every time the resource hands back a new
       `reload` identity. */
    const reloadRef = React.useRef(inbox.reload);
    React.useEffect(() => {
        reloadRef.current = inbox.reload;
    });

    const [lastEvent, setLastEvent] = React.useState<InboxStreamEvent | null>(null);

    React.useEffect(() => {
        if (!live) return;
        const handle = openStream<InboxStreamEvent>({
            url: inboxEventsUrl(),
            events: INBOX_STREAM_EVENTS,
            mintToken: () => liveChatService.inboxStreamToken(),
            onEvent: (event) => {
                setLastEvent(event);
                reloadRef.current();
            },
            onReconnect: () => reloadRef.current(),
        });
        return () => handle.close();
    }, [live]);

    if (!live) {
        return (
            <EmptyState
                icon={PlugZap}
                title="The live desk reads the API"
                description="A live chat is somebody typing with a clock running — there is nothing to draw without the backend. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend to work the desk."
            />
        );
    }

    return (
        <ResourceBoundary resource={inbox}>
            {(page) => (
                <LiveDesk
                    page={page}
                    presence={presence}
                    canned={canned.data ?? []}
                    lastEvent={lastEvent}
                    facets={facets}
                    onFacetsChange={setFacets}
                    onChanged={() => {
                        inbox.reload();
                        presence.reload();
                    }}
                />
            )}
        </ResourceBoundary>
    );
}
