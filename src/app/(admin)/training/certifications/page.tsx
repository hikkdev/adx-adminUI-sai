import type { Metadata } from "next";
import { CertificationsLoader } from "./certifications-loader";

export const metadata: Metadata = { title: "Certifications" };

export default function CertificationsPage() {
    return <CertificationsLoader />;
}
