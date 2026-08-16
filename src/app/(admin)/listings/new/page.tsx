import type { Metadata } from "next";
import { api } from "@/services";
import { ListingCreate } from "./listing-create";

export const metadata: Metadata = { title: "Add Inventory" };

export default async function ListingCreatePage() {
    const publishers = await api.publishers.list();
    return <ListingCreate publishers={publishers} />;
}
