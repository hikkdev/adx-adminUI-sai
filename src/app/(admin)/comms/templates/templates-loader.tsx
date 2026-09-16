"use client";

import * as React from "react";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import type { FilterSelection } from "@/components/adx/filter-panel";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { commsReadApi, commsService, type CommsEvent, type SmsVocabulary, type TemplateStatus, type TemplatesPage } from "@/services/comms";
import { settingsService, type CommsSettings } from "@/services/settings";
import { CommsOffline } from "../comms-offline";
import { TemplatesView } from "./templates-view";

/** Every template fits one page: the seed is eleven rows and ops add a handful. */
const PAGE_SIZE = 100;

/** What the editor checks a draft against: the events the code raises and the DLT kinds the rails know. */
export interface TemplateVocabulary {
    events: CommsEvent[];
    sms: SmsVocabulary;
    /**
     * Lot G (Q117): the platform's quiet hours and weekly cap, off the
     * `comms` section of `GET /settings/platform`. Null when that read
     * failed or the backend does not serve the section; the rules card
     * then says so rather than drawing a default.
     */
    rules: CommsSettings | null;
}

/**
 * The template library — `GET /comms/templates`.
 *
 * Status and the search are the list contract's own cuts, so changing
 * either refetches; the channel facet is a cut over the page, because the
 * contract has no channel filter and the page holds every row anyway.
 *
 * The vocabulary — `GET /comms/events`, `GET /comms/sms-kinds` and the
 * `comms` rules off `GET /settings/platform` — is a second resource under
 * a key that never moves: it is the same whatever the filters say, and a
 * search keystroke should not refetch the catalogue. It reloads with the
 * page after a save, because a new template changes which copy an event
 * has on file. The settings read is allowed to fail on its own: the rules
 * card then says it could not be read, and the library still draws.
 */
export function TemplatesLoader() {
    const live = commsReadApi();
    const [selection, setSelection] = React.useState<FilterSelection>({});
    const [q, setQ] = React.useState("");
    const search = useDebounced(q.trim(), 300);
    const status = (selection.status ?? []) as TemplateStatus[];

    const vocabulary = useApiResource<TemplateVocabulary>(`comms:templates:vocabulary:${live}`, async () => {
        if (!live) return { events: [], sms: { kinds: [], rails: [] }, rules: null };
        const [events, sms, platform] = await Promise.all([
            commsService.events(),
            commsService.smsKinds(),
            settingsService.get().catch(() => null),
        ]);
        return { events, sms, rules: platform?.comms ?? null };
    });

    const resource = useApiResource<TemplatesPage>(
        `comms:templates:${live}:${status.join(",")}:${search}`,
        () =>
            live
                ? commsService.templates({ status: status.length ? status : undefined, q: search || undefined, sort: "key", pageSize: PAGE_SIZE })
                : Promise.resolve({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE, counts: {} }),
    );

    if (!live) return <CommsOffline what="The outbound copy" />;

    const reload = () => {
        resource.reload();
        vocabulary.reload();
    };

    return (
        <ResourceBoundary resource={vocabulary}>
            {(vocab) => (
                <ResourceBoundary resource={resource}>
                    {(page) => (
                        <TemplatesView
                            page={page}
                            vocabulary={vocab}
                            selection={selection}
                            onSelectionChange={setSelection}
                            q={q}
                            onSearch={setQ}
                            onChanged={reload}
                        />
                    )}
                </ResourceBoundary>
            )}
        </ResourceBoundary>
    );
}
