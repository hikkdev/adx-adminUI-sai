import type { Metadata } from "next";
import { api } from "@/services";
import { AdminUsersView } from "./admin-users-view";

export const metadata: Metadata = { title: "Admin Users" };

export default async function AdminUsersPage() {
    const [users, invites] = await Promise.all([
        api.adminUsers.list(),
        api.adminUsers.pendingInvites(),
    ]);
    return <AdminUsersView users={users} invites={invites} />;
}
