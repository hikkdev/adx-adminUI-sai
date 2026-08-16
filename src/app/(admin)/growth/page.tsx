import type { Metadata } from "next";
import { api } from "@/services";
import { GrowthView } from "./growth-view";

export const metadata: Metadata = { title: "Growth CMS" };

export default async function GrowthPage() {
    const milestones = await api.growth.milestones();
    return <GrowthView milestones={milestones} />;
}
