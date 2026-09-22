import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { MapLoader } from "./map-loader";

export const metadata: Metadata = { title: "Hunting map" };

/** LH5: the ops map — every open lead in view, the heat, territories, zones, assign from a polygon. */
export default function LeadsMapPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <MapLoader />
        </div>
    );
}
