"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileCheck, Loader2, Plus, Wallet } from "lucide-react";
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
import { useApiResource } from "@/lib/use-api-resource";
import { useDebounced } from "@/lib/use-debounced";
import { MIN_QUERY_LENGTH, searchService, type SearchGroup } from "@/services/search";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const quickActions = [
    { title: "Add publisher", href: "/publishers/directory", icon: Plus },
    { title: "Review KYC queue", href: "/kyc", icon: FileCheck },
    { title: "Open withdrawal approvals", href: "/finance", icon: Wallet },
];

/**
 * Global search (⌘K or "/") — DR 10 `5102:21873`.
 *
 * The navigation entries and the quick actions stand above; from two
 * characters the palette fans out to the six record routes, five rows a
 * group, each row opening the record. cmdk's own text filter is off — the
 * server matched on fields the row does not print (a mobile, a reference)
 * — so the navigation rows are narrowed here by title instead.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const router = useRouter();
    const [query, setQuery] = React.useState("");
    const settled = useDebounced(query.trim(), 300);
    const searching = settled.length >= MIN_QUERY_LENGTH && searchService.readsApi();

    /* Keyed on the settled query, so a late answer to an earlier one is dropped. */
    const results = useApiResource<SearchGroup[]>(`palette:${searching}:${settled}`, () =>
        searching ? searchService.records(settled) : Promise.resolve([])
    );
    const groups = results.data ?? [];

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

    const needle = query.trim().toLowerCase();
    const matches = (title: string) => !needle || title.toLowerCase().includes(needle);
    const navItems = allNavItems.filter((item) => matches(item.title));
    const actions = quickActions.filter((action) => matches(action.title));
    /* Typing is ahead of the debounce; the row says so rather than showing stale groups. */
    const pending = results.loading || (query.trim().length >= MIN_QUERY_LENGTH && query.trim() !== settled);

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange} commandProps={{ shouldFilter: false }}>
            <CommandInput
                placeholder="Search pages, publishers, campaigns…"
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                {navItems.length > 0 && (
                    <CommandGroup heading="Go to">
                        {navItems.map((item) => (
                            <CommandItem key={item.href} value={`nav:${item.href}`} onSelect={() => go(item.href)}>
                                <item.icon className="mr-2 size-4" />
                                {item.title}
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
                {actions.length > 0 && (
                    <>
                        <CommandSeparator />
                        <CommandGroup heading="Quick actions">
                            {actions.map((action) => (
                                <CommandItem key={action.title} value={`action:${action.title}`} onSelect={() => go(action.href)}>
                                    <action.icon className="mr-2 size-4" />
                                    {action.title}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </>
                )}
                {searchService.readsApi() && query.trim().length >= MIN_QUERY_LENGTH && (
                    <>
                        <CommandSeparator />
                        {pending && (
                            <CommandGroup heading="Records">
                                <CommandItem value="search:pending" disabled>
                                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                                    Searching…
                                </CommandItem>
                            </CommandGroup>
                        )}
                        {!pending && groups.length === 0 && (
                            <CommandGroup heading="Records">
                                <CommandItem value="search:none" disabled>
                                    No records match &ldquo;{settled}&rdquo;.
                                </CommandItem>
                            </CommandGroup>
                        )}
                        {!pending &&
                            groups.map((group) => (
                                <CommandGroup key={group.domain} heading={group.heading}>
                                    {group.hits.map((hit) => (
                                        <CommandItem
                                            key={`${group.domain}:${hit.id}`}
                                            value={`${group.domain}:${hit.id}`}
                                            onSelect={() => go(hit.href)}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate">{hit.title}</span>
                                                {hit.subtitle && (
                                                    <span className="block truncate text-xs text-muted-foreground">
                                                        {hit.subtitle}
                                                    </span>
                                                )}
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ))}
                    </>
                )}
            </CommandList>
        </CommandDialog>
    );
}
