"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface SubNavProps {
    items: { label: string; href: string; exact?: boolean }[];
    className?: string;
    /**
     * Pinned under the fixed header while the page scrolls (default). A section
     * whose tabs sit in a wrapper with something else (KYC: the tabs and the
     * providers line) passes false and puts `STICKY_SECTION_BAR` on the wrapper.
     */
    sticky?: boolean;
}

/**
 * The section bar stays in view (the owner, 2 Oct 2026: "when we scroll … make
 * sure that this entire topbar remains sticky so that I can understand where I
 * am at"). It sits under the fixed 57px header, on the page's own ground, and
 * runs to the content edges so nothing scrolls visibly behind it.
 */
export const STICKY_SECTION_BAR = "sticky top-[57px] z-20 -mx-4 bg-canvas px-4 pt-2 sm:-mx-6 sm:px-6";

/** Underline link tabs for section-level navigation (e.g. Finance). */
export function SubNav({ items, className, sticky = true }: SubNavProps) {
    const pathname = usePathname();
    return (
        <nav className={cn("flex gap-6 border-b", sticky && STICKY_SECTION_BAR, className)}>
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
