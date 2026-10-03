import type { Metadata } from "next";
import { ContentNav } from "../content-nav";
import { FormsLoader } from "./forms-loader";

export const metadata: Metadata = { title: "Content · Forms" };

/** FM-1: the questions a page asks and where the answers go — every form, with what is live and what waits. */
export default function ContentFormsPage() {
    return (
        <div className="space-y-5">
            <ContentNav />
            <FormsLoader />
        </div>
    );
}
