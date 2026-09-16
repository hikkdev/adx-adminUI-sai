import type { Metadata } from "next";
import { NotificationsLoader } from "./notifications-loader";

export const metadata: Metadata = { title: "Notifications" };

/** The feed and the preference matrix are the signed-in operator's own, so both are read in the browser. */
export default function NotificationsPage() {
    return <NotificationsLoader />;
}
