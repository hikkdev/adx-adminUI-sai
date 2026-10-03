"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { formsReadApi, formsService, type FormRow } from "@/services/forms";
import { MediaOffline } from "../media/media-loader";
import { FormsView } from "./forms-view";

/** FM-1: every form in one read. No fixtures — a seeded form would look exactly like a published one. */
export function FormsLoader() {
    const live = formsReadApi();
    const resource = useApiResource<FormRow[]>(`forms:list:${live}`, () => (live ? formsService.list() : Promise.resolve([])));
    if (!live) return <MediaOffline />;
    return <ResourceBoundary resource={resource}>{(rows) => <FormsView forms={rows} onChanged={resource.reload} />}</ResourceBoundary>;
}
