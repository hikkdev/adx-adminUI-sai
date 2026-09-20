"use client";

import { Palette } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { brandManagerService, type BrandManagerView } from "@/services/branding";
import { integrationsReadApi } from "@/services/integrations";
import { BrandView } from "./brand-view";

/** The one `GET /branding` read; every save, publish and restore re-reads it so the page shows what the server holds. */
export function BrandLoader() {
    const live = integrationsReadApi();
    const { can } = useAuth();
    const resource = useApiResource<BrandManagerView>(`settings:brand:${live}`, () => brandManagerService.get());

    if (!live) {
        return (
            <EmptyState
                icon={Palette}
                title="The brand lives on the API"
                description="Logos, colours and the release history are on the server. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the ADX backend."
            />
        );
    }

    return <ResourceBoundary resource={resource}>{(data) => <BrandView data={data} mayEdit={can("settings.edit")} onChanged={resource.reload} />}</ResourceBoundary>;
}
