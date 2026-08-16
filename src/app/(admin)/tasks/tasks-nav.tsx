import { SubNav } from "@/components/adx/sub-nav";

/** Section tabs shared by the Tasks pages. */
export function TasksNav() {
    return (
        <SubNav
            items={[
                { label: "Overview", href: "/tasks", exact: true },
                { label: "Board", href: "/tasks/board" },
                { label: "Risk & issues", href: "/tasks/issues" },
            ]}
        />
    );
}
