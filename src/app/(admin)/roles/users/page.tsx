import { redirect } from "next/navigation";

/** Admin accounts now live with every other account under Users. */
export default function AdminUsersPage() {
    redirect("/users");
}
