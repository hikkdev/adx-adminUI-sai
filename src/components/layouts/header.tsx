"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, PanelLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialsAvatar } from "@/components/adx/initials-avatar";
import { currentAdmin } from "@/data/platform";

interface HeaderProps {
    onToggleSidebar: () => void;
    onOpenSearch: () => void;
    onOpenNotifications: () => void;
    unreadCount: number;
}

/** Top app bar: nav toggle, brand, global search trigger, alerts, account. */
export function Header({
    onToggleSidebar,
    onOpenSearch,
    onOpenNotifications,
    unreadCount,
}: HeaderProps) {
    const router = useRouter();

    return (
        <header className="fixed inset-x-0 top-0 z-40 flex h-[57px] items-center gap-3 border-b bg-card px-4">
            <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle navigation"
                className="size-8 shrink-0"
                onClick={onToggleSidebar}
            >
                <PanelLeft className="size-4" />
            </Button>

            <Link href="/dashboard" className="flex shrink-0 items-center">
                <span className="text-base font-semibold tracking-tight text-foreground">ADX.</span>
            </Link>

            <div className="pointer-events-none absolute inset-x-0 mx-auto hidden w-full max-w-[512px] md:block">
                <button
                    type="button"
                    onClick={onOpenSearch}
                    className="pointer-events-auto flex h-[34px] w-full items-center gap-2 rounded-md border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
                >
                    <Search className="size-4 shrink-0" />
                    <span className="flex-1 text-left">Search</span>
                    <kbd className="rounded border px-1.5 text-xs text-muted-foreground">/</kbd>
                </button>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                    className="relative size-8"
                    onClick={onOpenNotifications}
                >
                    <Bell className="size-4" />
                    {unreadCount > 0 && (
                        <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-card" />
                    )}
                </Button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 transition-colors hover:bg-muted/50"
                            aria-label="Account menu"
                        >
                            <InitialsAvatar name={currentAdmin.name} size="md" />
                            <ChevronDown className="size-4 text-muted-foreground" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>
                            <p className="text-sm font-medium">{currentAdmin.name}</p>
                            <p className="text-xs font-normal text-muted-foreground">
                                {currentAdmin.email}
                            </p>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => router.push("/account")}>
                            My account
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => router.push("/settings")}>
                            Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => router.push("/login")}>
                            Log out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}
