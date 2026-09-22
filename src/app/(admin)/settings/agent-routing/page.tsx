import type { Metadata } from "next";
import { SettingsNav } from "../settings-nav";
import { RoutingLoader } from "./routing-loader";

export const metadata: Metadata = { title: "Agent routing" };

/** AG-5: the bands-to-grades map that decides which grade of agent an account or a lead is routed to. */
export default function AgentRoutingPage() {
    return (
        <div className="space-y-5">
            <SettingsNav />
            <RoutingLoader />
        </div>
    );
}
