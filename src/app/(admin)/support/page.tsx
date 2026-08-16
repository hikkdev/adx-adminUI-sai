import type { Metadata } from "next";
import { api } from "@/services";
import { SupportConsole } from "./support-console";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
    const tickets = await api.support.tickets();
    return <SupportConsole tickets={tickets} />;
}
