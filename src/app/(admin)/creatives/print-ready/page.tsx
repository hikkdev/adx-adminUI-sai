import type { Metadata } from "next";
import { CreativesNav } from "../creatives-nav";
import { PrintReadyLoader } from "./print-ready-loader";

export const metadata: Metadata = { title: "Print-ready artwork" };

/** CR-1: approved artwork, its spot's specs, and whether a shop has it. */
export default function PrintReadyPage() {
    return (
        <div className="space-y-5">
            <CreativesNav />
            <PrintReadyLoader />
        </div>
    );
}
