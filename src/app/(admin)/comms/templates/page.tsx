import type { Metadata } from "next";
import { CommsNav } from "../comms-nav";
import { TemplatesView } from "./templates-view";

export const metadata: Metadata = { title: "Notification Templates" };

export default function TemplatesPage() {
    return (
        <div className="space-y-5">
            <CommsNav />
            <TemplatesView />
        </div>
    );
}
