import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { EsignLoader } from "./esign-loader";

export const metadata: Metadata = { title: "E-signing" };

/** DS-1 (Digio eSign): which of the five documents are e-signed rather than clicked, how and when. */
export default function EsignSettingsPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <EsignLoader />
        </div>
    );
}
