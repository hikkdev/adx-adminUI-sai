import type { Metadata } from "next";
import { api } from "@/services";
import { AuditView } from "./audit-view";

export const metadata: Metadata = { title: "Audit Log" };

export default async function AuditPage() {
    const events = await api.audit.list();
    return <AuditView events={events} />;
}
