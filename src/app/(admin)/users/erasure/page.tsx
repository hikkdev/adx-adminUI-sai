import type { Metadata } from "next";
import { ErasureLoader } from "./erasure-loader";

export const metadata: Metadata = { title: "Erasure requests" };

export default function ErasureRequestsPage() {
    return <ErasureLoader />;
}
