import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { BrandLoader } from "./brand-loader";

export const metadata: Metadata = { title: "Brand & theme" };

export default function BrandPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <BrandLoader />
        </div>
    );
}
