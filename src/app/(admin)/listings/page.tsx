import type { Metadata } from "next";
import { ListingsNav } from "./listings-nav";
import { ListingsLoader } from "./listings-loader";

export const metadata: Metadata = { title: "Listings" };

export default function ListingsPage() {
    return (
        <div className="space-y-5">
            <ListingsNav />
            <ListingsLoader />
        </div>
    );
}
