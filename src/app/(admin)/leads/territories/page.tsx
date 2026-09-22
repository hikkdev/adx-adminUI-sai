import type { Metadata } from "next";
import { LeadsNav } from "../leads-nav";
import { TerritoriesLoader } from "./territories-loader";

export const metadata: Metadata = { title: "Territories" };

/** LH5 (D8): the drawn areas that route new leads to one agent — route-only; the map stays open to every agent of the side. */
export default function TerritoriesPage() {
    return (
        <div className="space-y-5">
            <LeadsNav />
            <TerritoriesLoader />
        </div>
    );
}
