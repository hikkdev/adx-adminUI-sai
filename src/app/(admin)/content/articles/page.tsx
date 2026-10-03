import type { Metadata } from "next";
import { ContentNav } from "../content-nav";
import { ContentLoader } from "./content-loader";

export const metadata: Metadata = { title: "Content · Articles" };

/**
 * CT-1: the text pages ADX writes itself — help articles, guides, news, a
 * policy the thirteen legal kinds do not cover. PB-1 (27 Sep 2026): they
 * were the Pages tab at `/content`; that address is the Studio index now,
 * and a WEBSITE article can become a Studio page from here.
 */
export default function ContentArticlesPage() {
    return (
        <div className="space-y-5">
            <ContentNav />
            <ContentLoader />
        </div>
    );
}
