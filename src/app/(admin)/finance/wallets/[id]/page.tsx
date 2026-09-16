import type { Metadata } from "next";
import { WalletLoader } from "./wallet-loader";

export const metadata: Metadata = { title: "Wallet" };

export default async function WalletDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <WalletLoader id={id} />;
}
