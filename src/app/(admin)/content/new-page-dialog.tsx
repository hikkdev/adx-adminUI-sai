"use client";

import * as React from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { openStudio } from "@/lib/studio";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    PAGE_CHANNELS,
    PAGE_CHANNEL_LABEL,
    PAGE_TEMPLATES,
    PAGE_TEMPLATE_META,
    keyProblem,
    pageKeyFrom,
    pathProblem,
    sitePagesService,
    suggestedPath,
    type PageTemplate,
    type SitePageChannel,
    type SitePageRow,
} from "@/services/site-pages";

interface NewPageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Keys already in use — the dialog refuses one of these before the server does. */
    takenKeys: readonly string[];
    /** Addresses already answered, pages and redirect sources alike. */
    takenPaths: readonly string[];
    onCreated: (page: SitePageRow) => void;
}

/**
 * PB-1: a new Studio page. The title suggests the key and the key the
 * address until somebody types their own; a template gives the draft its
 * first blocks; the channels say where it is read. Creating opens Studio
 * in a new tab with the draft ready to lay out.
 */
export function NewPageDialog({ open, onOpenChange, takenKeys, takenPaths, onCreated }: NewPageDialogProps) {
    if (!open) return <Dialog open={false} onOpenChange={onOpenChange} />;
    return <NewPageForm onOpenChange={onOpenChange} takenKeys={takenKeys} takenPaths={takenPaths} onCreated={onCreated} />;
}

function NewPageForm({ onOpenChange, takenKeys, takenPaths, onCreated }: Omit<NewPageDialogProps, "open">) {
    const [title, setTitle] = React.useState("");
    const [key, setKey] = React.useState("");
    const [keyTouched, setKeyTouched] = React.useState(false);
    const [path, setPath] = React.useState("");
    const [pathTouched, setPathTouched] = React.useState(false);
    const [template, setTemplate] = React.useState<PageTemplate>("blank");
    const [channels, setChannels] = React.useState<SitePageChannel[]>(["WEBSITE"]);
    const [busy, setBusy] = React.useState(false);
    const [tried, setTried] = React.useState(false);

    const onTitle = (next: string) => {
        setTitle(next);
        if (!keyTouched) {
            const suggested = pageKeyFrom(next);
            setKey(suggested);
            if (!pathTouched) setPath(suggestedPath(suggested));
        }
    };
    const onKey = (next: string) => {
        setKeyTouched(true);
        setKey(next);
        if (!pathTouched) setPath(suggestedPath(next));
    };

    const keyIssue = keyProblem(key, takenKeys);
    const pathIssue = pathProblem(path, { kind: "CUSTOM" }) ?? (takenPaths.includes(path.trim()) ? "Another page or a redirect already answers this address." : null);
    const titleIssue = title.trim() ? null : "A page needs a title.";
    const channelIssue = channels.length ? null : "Pick where it is read.";
    const ready = !keyIssue && !pathIssue && !titleIssue && !channelIssue;
    const shown = (issue: string | null, value: string) => (tried || value ? issue : null);

    const toggle = (channel: SitePageChannel) => setChannels((current) => (current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]));

    async function submit() {
        setTried(true);
        if (!ready || busy) return;
        setBusy(true);
        try {
            const page = await sitePagesService.create({ key, title: title.trim(), path: path.trim(), channels, template });
            toast.success(`“${page.title ?? title.trim()}” made`, { description: "Its draft is open in Studio. Nothing shows until it is published." });
            onCreated(page);
            onOpenChange(false);
            openStudio({ kind: "page", key: page.key ?? key });
        } catch (cause) {
            toast.error(cause instanceof ApiError ? cause.message : "The page was not made.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open onOpenChange={(next) => (!next && !busy ? onOpenChange(false) : undefined)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>New page</DialogTitle>
                    <DialogDescription>A page of blocks, laid out in Studio. It answers at its address once a version is published.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="grid gap-1.5">
                        <Label htmlFor="new-page-title">Title</Label>
                        <Input id="new-page-title" value={title} onChange={(event) => onTitle(event.target.value)} placeholder="Diwali offers" autoFocus data-testid="new-page-title" />
                        {shown(titleIssue, title) && <p className="text-xs text-danger">{titleIssue}</p>}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="new-page-key">Key — never changes</Label>
                            <Input id="new-page-key" value={key} onChange={(event) => onKey(event.target.value)} placeholder="diwali-offers" className="font-mono" data-testid="new-page-key" />
                            <p className={cn("text-xs", shown(keyIssue, key) ? "text-danger" : "text-muted-foreground")} data-testid="new-page-key-hint">
                                {shown(keyIssue, key) ?? "What blocks and the apps link by."}
                            </p>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="new-page-path">Address — can change later</Label>
                            <Input
                                id="new-page-path"
                                value={path}
                                onChange={(event) => {
                                    setPathTouched(true);
                                    setPath(event.target.value);
                                }}
                                placeholder="/diwali-offers"
                                className="font-mono"
                                data-testid="new-page-path"
                            />
                            <p className={cn("text-xs", shown(pathIssue, path) ? "text-danger" : "text-muted-foreground")} data-testid="new-page-path-hint">
                                {shown(pathIssue, path) ?? "Where the website answers it."}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid content-start gap-1.5">
                            <Label htmlFor="new-page-template">Start from</Label>
                            <Select value={template} onValueChange={(value) => setTemplate(value as PageTemplate)}>
                                <SelectTrigger id="new-page-template" data-testid="new-page-template">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_TEMPLATES.map((option) => (
                                        <SelectItem key={option} value={option}>
                                            {PAGE_TEMPLATE_META[option].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{PAGE_TEMPLATE_META[template].blurb}</p>
                        </div>
                        <div className="grid content-start gap-1.5">
                            <Label>Read on</Label>
                            <div className="flex flex-wrap gap-1.5">
                                {PAGE_CHANNELS.map((channel) => (
                                    <Button
                                        key={channel}
                                        type="button"
                                        size="sm"
                                        variant={channels.includes(channel) ? "default" : "outline"}
                                        className={cn("h-8", !channels.includes(channel) && "bg-card")}
                                        onClick={() => toggle(channel)}
                                        data-testid={`new-page-channel-${channel}`}
                                    >
                                        {PAGE_CHANNEL_LABEL[channel]}
                                    </Button>
                                ))}
                            </div>
                            <p className={cn("text-xs", tried && channelIssue ? "text-danger" : "text-muted-foreground")}>{(tried && channelIssue) || "The website, the apps, or both."}</p>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" className="bg-card" onClick={() => onOpenChange(false)} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={() => void submit()} disabled={busy} data-testid="new-page-submit">
                        {busy ? "Making…" : "Make and open in Studio"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
