import type { Metadata } from "next";
import { api } from "@/services";
import { AdvertisersTable } from "./advertisers-table";

export const metadata: Metadata = { title: "Advertisers" };

export default async function AdvertisersPage() {
    const advertisers = await api.advertisers.list();
    return <AdvertisersTable advertisers={advertisers} />;
}
