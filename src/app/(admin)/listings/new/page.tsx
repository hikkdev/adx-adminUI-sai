import type { Metadata } from "next";
import { ListingCreateLoader } from "./listing-create-loader";

export const metadata: Metadata = { title: "Add inventory" };

export default function ListingCreatePage() {
    return <ListingCreateLoader />;
}
