import type { Metadata } from "next";
import { PublisherInvoicesLoader } from "./publisher-invoices-loader";

export const metadata: Metadata = { title: "Publisher invoices" };

export default function PublisherInvoicesPage() {
    return <PublisherInvoicesLoader />;
}
