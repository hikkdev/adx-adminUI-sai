import type { Metadata } from "next";
import { ContentNav } from "../content-nav";
import { LegalLoader } from "./legal-loader";

export const metadata: Metadata = { title: "Content · Policies" };

/**
 * The thirteen policies the apps link to. They live under Content because
 * nobody signs them — the contracts a party accepts are Legal documents.
 * The route stays `/content/policies` so every bookmark and deep link still lands.
 */
export default function PoliciesPage() {
    return (
        <div className="space-y-5">
            <ContentNav />
            <LegalLoader />
        </div>
    );
}
