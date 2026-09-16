import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { ImportFormatsLoader } from "./import-formats-loader";

export const metadata: Metadata = { title: "Import formats" };

/** Package U — every import kind's file format in one place: the columns, the rules, a template each. */
export default function ImportFormatsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <ImportFormatsLoader />
        </div>
    );
}
