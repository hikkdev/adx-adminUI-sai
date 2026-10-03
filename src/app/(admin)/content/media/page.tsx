import type { Metadata } from "next";
import { ContentNav } from "../content-nav";
import { MediaLoader } from "./media-loader";

export const metadata: Metadata = { title: "Content · Media library" };

/** LM-1: every picture ADX's layout blocks and tiles draw — uploaded against a size spec, with alt text. Ad artwork lives with its ads (`/ads/display`). */
export default function MediaLibraryPage() {
    return (
        <div className="space-y-5">
            <ContentNav />
            <MediaLoader />
        </div>
    );
}
