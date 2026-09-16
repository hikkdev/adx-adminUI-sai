import type { Metadata } from "next";
import { MediaTypesLoader } from "./media-types-loader";

export const metadata: Metadata = { title: "Media types" };

export default function MediaTypesPage() {
    return <MediaTypesLoader />;
}
