import type { Metadata } from "next";
import { InventoryMap } from "./inventory-map";

export const metadata: Metadata = { title: "Inventory Map" };

export default function InventoryMapPage() {
    return <InventoryMap />;
}
