import type { Metadata } from "next";
import { api } from "@/services";
import { PublishersTable } from "./publishers-table";

export const metadata: Metadata = { title: "Publishers" };

export default async function PublishersPage() {
    const publishers = await api.publishers.list();
    return <PublishersTable publishers={publishers} />;
}
