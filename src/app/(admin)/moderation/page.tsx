import type { Metadata } from "next";
import { api } from "@/services";
import { ModerationView } from "./moderation-view";

export const metadata: Metadata = { title: "Content Review" };

export default async function ModerationPage() {
    const creatives = await api.moderation.creatives();
    return <ModerationView creatives={creatives} />;
}
