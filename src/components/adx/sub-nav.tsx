"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SubNavProps {
    items: { label: string; href: string; exact?: boolean }[];
    className?: string;
}

/** Underline link tabs for section-level navigation (e.g. Finance). */
export function SubNav({ items, className }: SubNavProps) {
    const pathname = usePathname();
    return (
        <nav className={cn("flex gap-6 border-b", className)}>
            {items.map((item) => {
                const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "-mb-px border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
                            active
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
