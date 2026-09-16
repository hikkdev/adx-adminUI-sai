import type { Metadata } from "next";
import { InventoryMapLoader } from "./inventory-map-loader";

export const metadata: Metadata = { title: "Inventory Map" };

export default function InventoryMapPage() {
    return <InventoryMapLoader />;
}
