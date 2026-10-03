"use client";

import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { DEFAULT_FIELD_KINDS, formsReadApi, formsService, type FieldKindInfo, type FormDetail } from "@/services/forms";
import { MediaOffline } from "../../media/media-loader";
import { FormEditorView } from "./form-editor";

export interface FormData {
    detail: FormDetail;
    /** The kinds the server takes; the console's own list when the read fails. */
    kinds: FieldKindInfo[];
}

/** FM-1: the form and the field vocabulary in one read; the editor starts again from the server's answer after every write. */
export function FormLoader({ formKey }: { formKey: string }) {
    const live = formsReadApi();
    const resource = useApiResource<FormData | null>(`forms:one:${live}:${formKey}`, async () => {
        if (!live) return null;
        const [detail, kinds] = await Promise.all([formsService.get(formKey), formsService.fieldKinds().catch(() => DEFAULT_FIELD_KINDS)]);
        return { detail, kinds: kinds.length ? kinds : DEFAULT_FIELD_KINDS };
    });
    if (!live) return <MediaOffline />;
    const stampOf = (data: FormData) => `${data.detail.draft?.id ?? "-"}:${data.detail.draft?.updatedAt ?? ""}:${data.detail.live?.id ?? "-"}:${data.detail.updatedAt}`;
    return <ResourceBoundary resource={resource}>{(data) => (data ? <FormEditorView key={stampOf(data)} detail={data.detail} kinds={data.kinds} onReload={resource.reload} /> : null)}</ResourceBoundary>;
}
