import type { Metadata } from "next";
import { api } from "@/services";
import { ListingsTable } from "./listings-table";

export const metadata: Metadata = { title: "Listings" };

export default async function ListingsPage() {
    const listings = await api.listings.list();
    return <ListingsTable listings={listings} />;
}
