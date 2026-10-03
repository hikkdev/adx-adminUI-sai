import type { Metadata } from "next";
import { ContentNav } from "../content-nav";
import { LayoutsLoader } from "./layouts-loader";

export const metadata: Metadata = { title: "Content · Layouts" };

/** LM-1: what each screen of the website and the apps draws, in what order, for whom and when. */
export default function LayoutsPage() {
    return (
        <div className="space-y-5">
            <ContentNav />
            <LayoutsLoader />
        </div>
    );
}
