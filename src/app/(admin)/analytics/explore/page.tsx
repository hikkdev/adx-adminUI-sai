import type { Metadata } from "next";
import { ExploreLoader } from "./explore-loader";

export const metadata: Metadata = { title: "Explore" };

/**
 * AN-2: the registry made usable — pick metrics, a window and a grain.
 *
 * A client loader rather than a server fetch: the question changes on every
 * click, and the catalogue behind the picker is read once and reused.
 */
export default function ExplorePage() {
    return <ExploreLoader />;
}
