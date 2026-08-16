import type { Metadata } from "next";
import { ImportView } from "./import-view";

export const metadata: Metadata = { title: "Import Publishers" };

export default function ImportPublishersPage() {
    return <ImportView />;
}
