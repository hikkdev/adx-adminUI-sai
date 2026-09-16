import type { Metadata } from "next";
import { InvoiceLoader } from "./invoice-loader";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <InvoiceLoader id={id} />;
}
