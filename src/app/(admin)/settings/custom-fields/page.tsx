import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { CustomFieldsLoader } from "./custom-fields-loader";

export const metadata: Metadata = { title: "Settings · Custom fields" };

/** CF-1: the extra questions asked of a publisher, an advertiser, a listing or a lead — one tab per record type. */
export default function CustomFieldsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <CustomFieldsLoader />
        </div>
    );
}
