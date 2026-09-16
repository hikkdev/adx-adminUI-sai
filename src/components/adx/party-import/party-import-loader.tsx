"use client";

import { useRouter } from "next/navigation";
import { useApiResource } from "@/lib/use-api-resource";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { Card } from "@/components/ui/card";
import { isLive } from "@/lib/api-config";
import { supplyService } from "@/services/supply";
import type { ImportPublisher, PartyImportConfig } from "./party-import-config";
import { PartyImportView, type LoadedImport, type OpenTarget } from "./party-import-view";

interface PartyImportLoaderProps {
    config: PartyImportConfig;
    importId: string | null;
    /** Package U: the publisher a listings or rate-card import is for, off the URL; null until picked. The parties pass nothing. */
    publisherId?: string | null;
    /** Package U: query the page keeps on every URL it builds (`kind=` on the listings import). */
    query?: Record<string, string>;
}

/**
 * The import page reads on the client: the party's history always, and
 * the one import named in the URL with its rows. A fresh upload lands the
 * reviewer on `?id=<new>` so the report is a page they can come back to.
 * One loader for every party — the config says which routes and which
 * page.
 *
 * Package U: for the publisher's two kinds the routes are scoped to the
 * publisher (`?publisherId=`), who is named in the URL by the picker or
 * the publisher page's Import menu, and whose name the header reads off
 * `GET /publishers/:id`. A report opened from the history without one
 * takes the publisher the import itself carries.
 */
export function PartyImportLoader({ config, importId, publisherId = null, query = {} }: PartyImportLoaderProps) {
    const router = useRouter();
    const live = isLive(config.liveDomain);
    const api = config.api(publisherId);
    const resource = useApiResource<LoadedImport>(`${config.party}:import:${importId ?? "new"}:${publisherId ?? "-"}:${live}`, async () => {
        if (!live) return { current: null, history: [], publisher: null };
        const [history, current] = await Promise.all([api.list(), importId ? api.get(importId) : Promise.resolve(null)]);
        const forId = config.needsPublisher ? (publisherId ?? current?.publisherId ?? null) : null;
        const publisher = forId ? await readPublisher(forId) : null;
        return { current, history, publisher };
    });

    const hrefFor = (target: OpenTarget | null, publisher: string | null) => {
        const params = new URLSearchParams(query);
        const forId = target?.publisherId ?? publisher;
        if (config.needsPublisher && forId) params.set("publisherId", forId);
        if (target) params.set("id", target.id);
        const encoded = params.toString();
        return encoded ? `${config.href}?${encoded}` : config.href;
    };

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-5 shadow-none">
                <p className="text-sm text-muted-foreground">
                    The import writes {config.plural} through the API. Set <code className="font-mono text-xs">NEXT_PUBLIC_USE_API=true</code> and point the
                    console at the ADX backend to upload a book.
                </p>
            </Card>
        );
    }

    return (
        <ResourceBoundary resource={resource}>
            {(data) => (
                <PartyImportView
                    config={config}
                    api={api}
                    loaded={data}
                    onOpen={(target) => router.push(hrefFor(target, publisherId))}
                    onPublisher={(publisher) => router.push(hrefFor(null, publisher?.id ?? null))}
                    onChanged={resource.reload}
                />
            )}
        </ResourceBoundary>
    );
}

/** The publisher's name and display id for the header — a read that fails leaves the id to stand in, never the page. */
async function readPublisher(id: string): Promise<ImportPublisher> {
    try {
        const publisher = await supplyService.publisher(id);
        return publisher ? { id: publisher.id, name: publisher.name, displayId: publisher.displayId } : { id, name: id, displayId: null };
    } catch {
        return { id, name: id, displayId: null };
    }
}
