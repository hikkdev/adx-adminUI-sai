import { AdminShell } from "@/components/layouts/admin-shell";
import { RequireAuth } from "@/lib/auth";

export default function AdminLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <RequireAuth>
            <AdminShell>{children}</AdminShell>
        </RequireAuth>
    );
}
