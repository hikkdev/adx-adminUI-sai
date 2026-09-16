"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { isLive } from "@/lib/api-config";
import { refreshFeatures } from "@/lib/use-feature";
import { coverageOf, flagsService, type Coverage, type FeatureFlag, type RegistryRead } from "@/services/flags";
import { flagFacetsHref, readFlagFacets, type FlagFacets } from "./flags-facets";
import { FlagsView } from "./flags-view";

export interface FlagsRead {
    flags: FeatureFlag[];
    registry: RegistryRead;
    coverage: Coverage;
}

/**
 * Two reads, one screen: `GET /flags` for the rows and `GET /flags/registry`
 * for the committed document with every surface. The Coverage card counts
 * from both and prints the registry read's own `check` block (G11-2) —
 * the backend's per-surface verdict, the one `npm run features:check`
 * prints — rather than a derivation of the console's own.
 *
 * L-C: the filters sit in the URL (`?surface=&kind=&source=&state=&owner=&q=`)
 * through `router.replace`, so a reload keeps the view and a link can land
 * on a slice of the registry. The whole list is read once — a few hundred
 * rows at most — and cut client-side with the server's own rules
 * (`flags-facets.ts`), so the paging, the sort and "Select all N
 * matching" work over every row without a refetch per click. The search
 * box writes `q` debounced: the rows follow every keystroke, the URL
 * follows once the typing settles.
 *
 * No fixtures. The seven seeded flags this page used to draw were read by
 * nothing, and a toggle on one of them changed a toast; a seeded flag next
 * to a real one would be a switch ops could throw that switched nothing.
 */
export function FlagsLoader() {
    const live = isLive("flags");
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const paramsString = params.toString();
    const urlFacets = React.useMemo(() => readFlagFacets(new URLSearchParams(paramsString)), [paramsString]);
    const [q, setQ] = React.useState(urlFacets.q);
    const settledQ = useDebounced(q, 300);

    React.useEffect(() => {
        if (settledQ.trim() === urlFacets.q.trim()) return;
        router.replace(flagFacetsHref(pathname, { ...urlFacets, q: settledQ }), { scroll: false });
    }, [settledQ, urlFacets, pathname, router]);

    const facets: FlagFacets = { ...urlFacets, q };

    const onFacets = React.useCallback(
        (next: Partial<FlagFacets>) => {
            const { q: nextQ, ...rest } = next;
            if (nextQ !== undefined) setQ(nextQ);
            if (Object.keys(rest).length) router.replace(flagFacetsHref(pathname, { ...urlFacets, ...rest }), { scroll: false });
        },
        [pathname, router, urlFacets],
    );

    const resource = useApiResource<FlagsRead | null>(`flags:registry:${live}`, async () => {
        if (!live) return null;
        const [flags, registry] = await Promise.all([flagsService.list(), flagsService.registry()]);
        return { flags, registry, coverage: coverageOf(flags, registry) };
    });

    if (!live) {
        return (
            <Card className="rounded-lg border-border p-8 text-center shadow-none">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                    <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">Not connected to the ADX backend</h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                    A flag here is a switch on a feature in both apps, the console and the website. There is no seeded stand-in,
                    because a fixture switch would be one ops could throw that switched nothing. Set{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code> and point the console at a
                    running backend.
                </p>
            </Card>
        );
    }

    const onChanged = () => {
        resource.reload();
        /* The session cache behind `useFeature` re-reads too, so a gate on
           another screen moves without waiting for the window to be refocused. */
        void refreshFeatures();
    };

    return (
        <ResourceBoundary resource={resource}>
            {(read) => (read ? <FlagsView read={read} facets={facets} onFacets={onFacets} onChanged={onChanged} /> : null)}
        </ResourceBoundary>
    );
}
