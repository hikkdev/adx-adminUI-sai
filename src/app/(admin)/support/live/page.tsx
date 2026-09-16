import type { Metadata } from "next";
import { SupportNav } from "../support-nav";
import { LiveLoader } from "./live-loader";

export const metadata: Metadata = { title: "Live chat" };

export default function LiveChatPage() {
    return (
        <div className="space-y-5">
            <SupportNav />
            <LiveLoader />
        </div>
    );
}
