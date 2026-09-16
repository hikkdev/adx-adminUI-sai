import type { Metadata } from "next";
import { WalletsLoader } from "./wallets-loader";

export const metadata: Metadata = { title: "Wallets" };

export default function WalletsPage() {
    return <WalletsLoader />;
}
