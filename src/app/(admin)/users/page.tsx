import type { Metadata } from "next";
import { api } from "@/services";
import type { PlatformUser } from "@/types";
import { UsersView } from "./users-view";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
    const [users, admins] = await Promise.all([api.users.list(), api.adminUsers.list()]);

    /* Admin console accounts, folded into the same directory. */
    const adminAccounts: PlatformUser[] = admins
        .filter((admin) => !users.some((user) => user.email === admin.email))
        .map((admin) => ({
            id: admin.id,
            name: admin.name,
            email: admin.email,
            mobile: "—",
            roles: ["ADMIN"],
            status: admin.status,
            city: "Bengaluru",
            joinedAt: "2025-08-19",
            lastActive: admin.lastLogin,
            kycVerified: true,
            twoFactor: admin.twoFactorEnabled,
            sessions: [],
            activity: [],
        }));

    return <UsersView users={[...users, ...adminAccounts]} />;
}
