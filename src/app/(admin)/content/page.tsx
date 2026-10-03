import type { Metadata } from "next";
import { ContentNav } from "./content-nav";
import { PagesLoader } from "./pages-loader";

export const metadata: Metadata = { title: "Content · Pages" };

/**
 * PB-1 (27 Sep 2026): the Studio index — every address the website answers
 * and the apps can open. The website's own pages and the ones made here,
 * each opened in Studio to lay out; addresses and redirects beside them.
 * The text pages the CMS held are the Articles tab now.
 */
export default function ContentPagesPage() {
    return (
        <div className="space-y-5">
            <ContentNav />
            <PagesLoader />
        </div>
    );
}
