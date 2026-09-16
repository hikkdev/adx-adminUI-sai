import type { Metadata } from "next";
import { AdminUsersLoader } from "./admin-users-loader";

export const metadata: Metadata = { title: "Role members" };

export default function AdminUsersPage() {
    return <AdminUsersLoader />;
}
