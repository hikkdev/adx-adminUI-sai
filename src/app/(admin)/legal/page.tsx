import type { Metadata } from "next";
import { LegalLoader } from "./legal-loader";

export const metadata: Metadata = { title: "Legal documents" };

export default function LegalPage() {
    return <LegalLoader />;
}
