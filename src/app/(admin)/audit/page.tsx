import type { Metadata } from "next";
import { AuditLoader } from "./audit-loader";

export const metadata: Metadata = { title: "Audit Log" };

export default function AuditPage() {
    return <AuditLoader />;
}
