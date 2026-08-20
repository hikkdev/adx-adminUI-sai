"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigation, type NavItem } from "@/config/navigation";
import { useAuth } from "@/lib/auth";

interface SidebarProps {
    collapsed: boolean;
    mobileOpen: boolean;
    onNavigate: () => void;
}

function NavLink({
    item,
    collapsed,
    onNavigate,
}: {
    item: NavItem;
    collapsed: boolean;
    onNavigate: () => void;
}) {
    const pathname = usePathname();
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
        <Link
            href={item.href}
            title={collapsed ? item.title : undefined}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
                "relative flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                collapsed && "md:justify-center md:px-0",
                active
                    ? // design.md: soft accent surface, 2px leading rule, dark text.
                      // A solid red capsule is prohibited by the design system.
                      "bg-primary/[0.07] text-foreground before:absolute before:-left-3.5 before:top-1/2 before:h-6 before:w-0.5 before:-translate-y-1/2 before:rounded-r-full before:bg-primary"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
            )}
        >
            <item.icon className="size-[18px] shrink-0" strokeWidth={1.8} />
            <span className={cn("truncate", collapsed && "md:hidden")}>{item.title}</span>
        </Link>
    );
}

/** ADX sidebar: desktop rail and mobile off-canvas navigation. */
export function Sidebar({ collapsed, mobileOpen, onNavigate }: SidebarProps) {
    const { signOut } = useAuth();
    return (
        <aside
            className={cn(
                "fixed bottom-0 left-0 top-[57px] z-30 flex w-[min(19rem,86vw)] -translate-x-full flex-col border-r bg-card transition-[transform,width] duration-200 md:translate-x-0",
                mobileOpen && "translate-x-0",
                collapsed ? "md:w-[68px]" : "md:w-[243px]"
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
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    collapsed={collapsed}
                                    onNavigate={onNavigate}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
            <div className="border-t px-3.5 py-4">
                <button
                    type="button"
                    title={collapsed ? "Log out" : undefined}
                    onClick={() => {
                        onNavigate();
                        void signOut();
                    }}
                    className={cn(
                        "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
                        collapsed && "md:justify-center md:px-0"
                    )}
                >
                    <LogOut className="size-[18px] shrink-0" strokeWidth={1.8} />
                    <span className={cn(collapsed && "md:hidden")}>Log Out</span>
                </button>
            </div>
        </aside>
    );
}