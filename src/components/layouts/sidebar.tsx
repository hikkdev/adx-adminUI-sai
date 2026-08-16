"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigation, type NavItem } from "@/config/navigation";

interface SidebarProps {
    collapsed: boolean;
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
    const pathname = usePathname();
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
        <Link
            href={item.href}
            title={collapsed ? item.title : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
                "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                collapsed && "justify-center px-0",
                active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
            )}
        >
            <item.icon className="size-[18px] shrink-0" strokeWidth={1.8} />
            {!collapsed && <span className="truncate">{item.title}</span>}
        </Link>
    );
}

/** ADX sidebar, marketplace section, divider, operations section, log out. */
export function Sidebar({ collapsed }: SidebarProps) {
    return (
        <aside
            className={cn(
                "fixed bottom-0 left-0 top-[57px] z-30 flex flex-col border-r bg-card transition-[width] duration-200",
                collapsed ? "w-[68px]" : "w-[243px]"
            )}
        >
            <nav
                aria-label="Main navigation"
                className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3.5 py-5"
            >
                {navigation.map((section, index) => (
                    <div key={section.id}>
                        {index > 0 && <div className="mb-6 border-t" />}
                        <div className="space-y-1">
                            {section.items.map((item) => (
                                <NavLink key={item.href} item={item} collapsed={collapsed} />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
            <div className="border-t px-3.5 py-4">
                <Link
                    href="/login"
                    title={collapsed ? "Log out" : undefined}
                    className={cn(
                        "flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
                        collapsed && "justify-center px-0"
                    )}
                >
                    <LogOut className="size-[18px] shrink-0" strokeWidth={1.8} />
                    {!collapsed && <span>Log Out</span>}
                </Link>
            </div>
        </aside>
    );
}
