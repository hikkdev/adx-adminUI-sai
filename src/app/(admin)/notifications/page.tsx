import type { Metadata } from "next";
import { api } from "@/services";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
    const notifications = await api.notifications.list();
    return <NotificationsView notifications={notifications} />;
}
