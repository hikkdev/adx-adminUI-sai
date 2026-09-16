import type { Metadata } from "next";
import { LadderLoader } from "./ladder-loader";

export const metadata: Metadata = { title: "Tier ladder" };

export default function LadderPage() {
    return <LadderLoader />;
}
