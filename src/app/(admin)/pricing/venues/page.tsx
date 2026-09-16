import type { Metadata } from "next";
import { VenuesLoader } from "./venues-loader";

export const metadata: Metadata = { title: "Venues" };

export default function VenuesPage() {
    return <VenuesLoader />;
}
