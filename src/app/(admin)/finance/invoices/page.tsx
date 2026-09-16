import type { Metadata } from "next";
import { InvoicesLoader } from "./invoices-loader";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
    return <InvoicesLoader />;
}
