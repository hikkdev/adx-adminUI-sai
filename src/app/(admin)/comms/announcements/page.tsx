import type { Metadata } from "next";
import { CommsNav } from "../comms-nav";
import { AnnouncementsLoader } from "./announcements-loader";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
    return (
        <div className="space-y-5">
            <CommsNav />
            <AnnouncementsLoader />
        </div>
    );
}
