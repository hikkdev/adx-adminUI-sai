"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileCheck, Plus, Wallet } from "lucide-react";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { allNavItems } from "@/config/navigation";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const quickActions = [
    { title: "Add publisher", href: "/publishers", icon: Plus },
    { title: "Review KYC queue", href: "/kyc", icon: FileCheck },
    { title: "Open withdrawal approvals", href: "/finance", icon: Wallet },
];

/** Global search (⌘K or "/"), jump to any module or quick action. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const router = useRouter();

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            const isTyping =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target.isContentEditable;

            if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !isTyping)) {
                event.preventDefault();
                onOpenChange(!open);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, onOpenChange]);

    const go = (href: string) => {
        onOpenChange(false);
        router.push(href);
    };

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Search pages, publishers, campaigns…" />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Go to">
                    {allNavItems.map((item) => (
                        <CommandItem key={item.href} onSelect={() => go(item.href)}>
                            <item.icon className="mr-2 size-4" />
                            {item.title}
                        </CommandItem>
                    ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Quick actions">
                    {quickActions.map((action) => (
                        <CommandItem key={action.title} onSelect={() => go(action.href)}>
                            <action.icon className="mr-2 size-4" />
                            {action.title}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
