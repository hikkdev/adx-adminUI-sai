import type { Metadata } from "next";
import { TemplatesLoader } from "./templates-loader";

export const metadata: Metadata = { title: "Agreements" };

export default function AgreementsPage() {
    return <TemplatesLoader />;
}
