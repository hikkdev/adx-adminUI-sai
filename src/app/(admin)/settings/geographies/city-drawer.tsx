"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ResourceBoundary } from "@/components/adx/resource-boundary";
import { useAuth } from "@/lib/auth";
import { useApiResource } from "@/lib/use-api-resource";
import { geoCityLabel, geoService, type CityReadiness, type GeoCityDetail } from "@/services/geo";
import { CityPanel } from "./city-panel";

interface CityDrawerProps {
    /** The city open in the drawer; null keeps it closed. */
    slug: string | null;
    onOpenChange: (open: boolean) => void;
    /** A move or a toggle landed: the desk behind the drawer reloads too. */
    onChanged: () => void;
}

/**
 * The city drawer — a pin on the map or a row in the list opens it; the
 * same panel the full page draws, over `GET /geo/cities/:slug` and its
 * readiness read, with a link to the page.
 */
export function CityDrawer({ slug, onOpenChange, onChanged }: CityDrawerProps) {
    return (
        <Sheet open={slug !== null} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl">
                {slug && <DrawerBody slug={slug} onChanged={onChanged} />}
            </SheetContent>
        </Sheet>
    );
}

function DrawerBody({ slug, onChanged }: { slug: string; onChanged: () => void }) {
    const { can } = useAuth();
    const detail = useApiResource<GeoCityDetail>(`geo:city:${slug}`, () => geoService.city(slug));
    const readiness = useApiResource<CityReadiness>(`geo:readiness:${slug}`, () => geoService.readiness(slug));
    const reload = () => {
        detail.reload();
        readiness.reload();
        onChanged();
    };

    return (
        <>
            <SheetHeader className="border-b px-5 py-4 text-left">
                <SheetTitle>{detail.data ? geoCityLabel(detail.data) : "City"}</SheetTitle>
                <SheetDescription>The stage, the six switches, what is in the city, and how it got here.</SheetDescription>
            </SheetHeader>
            <div className="flex-1 px-5 py-4">
                <ResourceBoundary resource={detail}>
                    {(city) => <CityPanel detail={city} readiness={readiness} onChanged={reload} mayEdit={can("settings.edit")} compact />}
                </ResourceBoundary>
            </div>
        </>
    );
}
