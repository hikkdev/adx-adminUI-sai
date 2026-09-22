import type { Metadata } from "next";
import { LiveMapLoader } from "./live-map-loader";

export const metadata: Metadata = { title: "Live map" };

/** LT-1: where every working agent is — states, alerts, trails, ETA — streamed from `/agent-locations`. */
export default function LiveMapPage() {
    return <LiveMapLoader />;
}
