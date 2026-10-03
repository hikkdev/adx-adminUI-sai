import type { Metadata } from "next";
import { SlotsView } from "./slots-view";

export const metadata: Metadata = { title: "Ads · Slots & pricing" };

/**
 * LM-1: the places ADX sells display ads in, their size and their price —
 * and, since AS-1, the two sponsored-listing placements beside them. Was
 * `/growth/ads/slots` and `/growth/ads/placements`.
 */
export default function SlotsPage() {
    return <SlotsView />;
}
