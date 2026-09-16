"use client";

import * as React from "react";
import { Loader2, MessageSquareText, Paperclip, Send, UserRoundCog, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PrivateFile, privateFileUrl } from "@/components/adx/private-file";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { supportService } from "@/services/support";
import { uploadService } from "@/services/uploads";
import {
    TICKET_STREAM_EVENTS,
    cannedQueryAt,
    chatReducer,
    initialChatState,
    insertCanned,
    liveChatService,
    matchCanned,
    openStream,
    stateFromThread,
    ticketEventsUrl,
    type CannedReply,
    type ChatMessage,
    type ChatState,
    type LiveInboxRow,
    type OperatorPresence,
    type TicketStreamEvent,
} from "@/services/live-chat";
import { PlanBadge } from "./plan-badge";

interface ChatPaneProps {
    row: LiveInboxRow;
    canned: CannedReply[];
    /** Everybody on the desk, for the reassign menu — lightest load first. */
    operators: OperatorPresence[];
    onChanged: () => void;
}

/** Typing is published at most this often; the server throttles to the same two seconds. */
const TYPING_EVERY_MS = 2000;
/** Silence this long means the operator stopped typing, and the indicator goes down. */
const TYPING_IDLE_MS = 3000;

/* ------------------------------------------------------------------ */
/* One line of the thread                                              */
/* ------------------------------------------------------------------ */

function Bubble({ message, mine, internal }: { message: ChatMessage; mine: boolean; internal: boolean }) {
    if (message.kind === "SYSTEM") {
        return (
            <div className="my-2 text-center text-[11px] text-muted-foreground">
                {message.message} · {formatDateTime(message.createdAt)}
            </div>
        );
    }

    return (
        <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div
                className={cn(
                    "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                    internal
                        ? "border border-warning/40 bg-warning-soft text-foreground"
                        : mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                )}
            >
                <p className={cn("text-[11px] font-medium", mine && !internal ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {message.authorName}
                    {internal && " · internal note"}
                </p>
                {message.message && <p className="mt-0.5 whitespace-pre-wrap break-words">{message.message}</p>}
                {message.attachment && (
                    /* The bytes need the bearer token, so nothing here is an
                       <img src>. PrivateFile fetches them, draws an image
                       inline and a PDF as a link that opens the blob. */
                    <PrivateFile
                        src={privateFileUrl(message.attachment.fileId)}
                        alt={message.attachment.name}
                        className="mt-2 max-h-64 max-w-full rounded object-contain"
                        frameClassName="mt-2 h-28 w-56 rounded"
                    />
                )}
                <p className={cn("mt-1 text-[10px]", mine && !internal ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {formatDateTime(message.createdAt)}
                </p>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The canned picker                                                   */
/* ------------------------------------------------------------------ */

function CannedPicker({
    replies,
    query,
    onPick,
    onDismiss,
}: {
    replies: CannedReply[];
    query: string;
    onPick: (reply: CannedReply) => void;
    onDismiss: () => void;
}) {
    const matches = matchCanned(replies, query).slice(0, 8);
    if (matches.length === 0) return null;
    return (
        <div
            role="listbox"
            aria-label="Canned replies"
            className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-full overflow-y-auto rounded-md border bg-card p-1 shadow-md"
        >
            <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted-foreground">
                <span>Canned replies{query ? ` matching “${query}”` : ""}</span>
                <button type="button" onClick={onDismiss} aria-label="Close canned replies" className="rounded p-0.5 hover:bg-muted">
                    <X className="size-3" aria-hidden />
                </button>
            </div>
            {matches.map((reply) => (
                <button
                    key={reply.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => onPick(reply)}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-muted"
                >
                    <span className="block text-sm font-medium text-foreground">
                        {reply.title}
                        {reply.team && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{reply.team}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{reply.body}</span>
                </button>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* The pane                                                            */
/* ------------------------------------------------------------------ */

/**
 * One live chat, streaming.
 *
 * The thread is read once by id and then kept by `GET /tickets/:id/events`.
 * Both land in the same reducer, keyed on the message id, which is what makes
 * a reconnect safe: the token in the stream URL is single use, so the retry is
 * ours, and a manual reopen cannot set `Last-Event-ID` — so the reopened URL
 * carries `?lastEventId=<ms of the newest message seen>` instead (I4-B/C),
 * the server replays what was written since and then the status, and the
 * reducer folds it in without showing a line twice. Only a reconnect with
 * nothing to resume from — the socket died before the first read landed —
 * re-reads the whole thread.
 *
 * Typing is a claim the pane has to withdraw itself (I4-C). The server takes
 * a `typing: true` and holds it until told otherwise, so a pane unmounted
 * mid-word — another chat picked, the desk left — would leave "Priya is
 * typing…" on the requester's phone. The unmount publishes `false` whenever a
 * `true` is still outstanding.
 *
 * What this pane deliberately cannot do is write an internal note. An ops note
 * is not chat: it belongs on the ticket thread control at `/support`, where
 * the server filters it out of the requester's stream per viewer. The composer
 * here posts `{ message, attachmentFileId? }` and nothing else, and the
 * service test pins that.
 */
export function ChatPane({ row, canned, operators, onChanged }: ChatPaneProps) {
    const { user } = useAuth();
    const me = user?.id ?? null;

    const [state, setState] = React.useState<ChatState>(initialChatState);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [text, setText] = React.useState("");
    const [caret, setCaret] = React.useState(0);
    const [pickerOpen, setPickerOpen] = React.useState(false);
    const [sending, setSending] = React.useState(false);
    const [uploading, setUploading] = React.useState(false);
    const [pendingFile, setPendingFile] = React.useState<{ id: string; name: string } | null>(null);
    const [busy, setBusy] = React.useState(false);

    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const fileRef = React.useRef<HTMLInputElement | null>(null);
    const bottomRef = React.useRef<HTMLDivElement | null>(null);
    const typingSentAt = React.useRef(0);
    const typingIdle = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    /* The newest message's stamp, kept where the stream's reconnect — which
       runs outside React's render — can read it without re-opening the socket
       on every line. */
    const lastEventIdRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        lastEventIdRef.current = state.lastEventId;
    }, [state.lastEventId]);

    const ticketId = row.id;

    /**
     * The catch-up read.
     *
     * Called from a callback, never from an effect body: after an ops move,
     * and after a reconnect that had nothing to resume from. The reducer
     * folds it in by message id, so re-reading is always safe and never
     * doubles a line.
     */
    const catchUp = React.useCallback(async () => {
        try {
            const thread = await liveChatService.thread(ticketId);
            setState((current) => stateFromThread(thread, current));
            setError(null);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The thread could not be read.");
        }
    }, [ticketId]);

    /* The first read. The pane is keyed on the ticket id by the desk, so a
       different chat is a different component and there is nothing to reset. */
    React.useEffect(() => {
        let cancelled = false;
        liveChatService
            .thread(ticketId)
            .then((thread) => {
                if (cancelled) return;
                setState((current) => stateFromThread(thread, current));
                setError(null);
            })
            .catch((cause: unknown) => {
                if (!cancelled) setError(cause instanceof Error ? cause.message : "The thread could not be read.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [ticketId]);

    /* The stream. One socket per chat; every event through the reducer. A
       reconnect resumes from the newest message seen; only when there is none
       to resume from does it fall back to re-reading the thread. */
    React.useEffect(() => {
        const handle = openStream<TicketStreamEvent>({
            url: ticketEventsUrl(ticketId),
            events: TICKET_STREAM_EVENTS,
            mintToken: () => liveChatService.streamToken(ticketId),
            resumeFrom: () => lastEventIdRef.current,
            onEvent: (event) => setState((current) => chatReducer(current, event)),
            onReconnect: () => {
                if (lastEventIdRef.current === null) void catchUp();
            },
        });
        return () => handle.close();
    }, [ticketId, catchUp]);

    /* Opening a chat is reading it, and the requester is told so. */
    React.useEffect(() => {
        void liveChatService.seen(ticketId).catch(() => undefined);
    }, [ticketId, state.messages.length]);

    React.useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: "end" });
    }, [state.messages.length]);

    /* Leaving the pane withdraws a typing claim still standing: the idle
       timer that would have sent the `false` dies with the component, so the
       unmount sends it instead. Nothing is sent when nothing was claimed. */
    React.useEffect(
        () => () => {
            if (typingIdle.current) clearTimeout(typingIdle.current);
            if (typingSentAt.current !== 0) {
                typingSentAt.current = 0;
                void liveChatService.typing(ticketId, false).catch(() => undefined);
            }
        },
        [ticketId],
    );

    const requesterTyping = state.typing.requester;
    const requesterSeenAt = state.seen.requester;
    const cannedQuery = cannedQueryAt(text, caret);
    const showPicker = pickerOpen || cannedQuery !== null;

    /* ── typing ───────────────────────────────────────────────────── */

    const publishTyping = (typing: boolean) => {
        if (typing) {
            const now = Date.now();
            if (now - typingSentAt.current < TYPING_EVERY_MS) return;
            typingSentAt.current = now;
        } else {
            typingSentAt.current = 0;
        }
        void liveChatService.typing(ticketId, typing).catch(() => undefined);
    };

    const onType = (value: string, position: number) => {
        setText(value);
        setCaret(position);
        publishTyping(true);
        if (typingIdle.current) clearTimeout(typingIdle.current);
        // A stop always goes: a stuck indicator is worse than a missed one.
        typingIdle.current = setTimeout(() => publishTyping(false), TYPING_IDLE_MS);
    };

    /* ── the composer ─────────────────────────────────────────────── */

    const pickCanned = (reply: CannedReply) => {
        const next = insertCanned(text, caret, reply.body);
        setText(next.text);
        setCaret(next.caret);
        setPickerOpen(false);
        const node = textareaRef.current;
        if (node) {
            node.focus();
            window.requestAnimationFrame(() => node.setSelectionRange(next.caret, next.caret));
        }
    };

    const attach = async (file: File) => {
        setUploading(true);
        try {
            const uploaded = await uploadService.upload(file, "SUPPORT_ATTACHMENT");
            setPendingFile({ id: uploaded.id, name: file.name });
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not upload that file.");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const send = async () => {
        const message = text.trim();
        if (!message && !pendingFile) return;
        setSending(true);
        try {
            await liveChatService.send(ticketId, message, pendingFile?.id ?? null);
            setText("");
            setCaret(0);
            setPendingFile(null);
            publishTyping(false);
            // The stream delivers the line; the inbox row's clocks move too.
            onChanged();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not send that message.");
        } finally {
            setSending(false);
        }
    };

    /* ── the three ops moves ──────────────────────────────────────── */

    const run = async (action: () => Promise<unknown>, success: string, description?: string) => {
        setBusy(true);
        try {
            await action();
            toast.success(success, description ? { description } : undefined);
            onChanged();
            await catchUp();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "That did not go through.");
        } finally {
            setBusy(false);
        }
    };

    const requester = row.requester.name?.trim() || row.requester.userId;
    const converted = state.channel === "TICKET";

    return (
        <Card className="flex min-h-[60vh] flex-col overflow-hidden rounded-lg border-border shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-foreground">{requester}</h2>
                        {/* The same badge the row wears: the plan held now, from
                            the inbox read, which the desk re-reads on every
                            stream event. */}
                        <PlanBadge plan={row.plan} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.displayId ? `${row.displayId} · ` : ""}
                        {state.assignedName ? `${state.assignedName} is on it` : "Nobody is on it"}
                        {converted && " · now a ticket"}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={busy}>
                                <UserRoundCog className="size-4" aria-hidden />
                                Reassign
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel>On the desk now</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {operators.length === 0 && (
                                <DropdownMenuItem disabled>Nobody is online</DropdownMenuItem>
                            )}
                            {operators.map((operator) => (
                                <DropdownMenuItem
                                    key={operator.userId}
                                    onSelect={() =>
                                        void run(
                                            () => liveChatService.reassign(ticketId, operator.userId),
                                            `${operator.name ?? "The operator"} is on this chat`,
                                            "The thread says so, and they have been told.",
                                        )
                                    }
                                >
                                    <span className="flex-1 truncate">{operator.name ?? operator.userId}</span>
                                    <span className="text-xs text-muted-foreground tabular-nums">{operator.openChats}</span>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || converted}
                        onClick={() =>
                            void run(
                                () => liveChatService.convert(ticketId),
                                "This chat is now a ticket",
                                "Same number, same thread. The requester has been told where it went.",
                            )
                        }
                    >
                        Convert to ticket
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                            void run(
                                () => supportService.close(ticketId),
                                "Chat resolved",
                                "The requester was told, and can reply on the thread if it is not.",
                            )
                        }
                    >
                        Close
                    </Button>
                </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {loading && (
                    <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Reading the thread…
                    </p>
                )}
                {error && !loading && <p className="py-8 text-sm text-danger">{error}</p>}
                {!loading &&
                    !error &&
                    state.messages.map((message) => (
                        <Bubble
                            key={message.id}
                            message={message}
                            mine={me !== null && message.authorId === me}
                            internal={message.internal}
                        />
                    ))}
                {requesterTyping && (
                    <p className="text-xs italic text-muted-foreground" data-testid="requester-typing">
                        {requester} is typing…
                    </p>
                )}
                <div ref={bottomRef} />
            </div>

            <div className="border-t px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                        {requesterSeenAt ? `Seen by ${requester} at ${formatDateTime(requesterSeenAt)}` : "Not seen yet"}
                    </span>
                    <span>
                        Internal notes live on the{" "}
                        <a href="/support" className="underline underline-offset-2">
                            ticket thread
                        </a>
                        , never here.
                    </span>
                </div>

                {pendingFile && (
                    <div className="mb-2 flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{pendingFile.name}</span>
                        <button
                            type="button"
                            onClick={() => setPendingFile(null)}
                            aria-label="Remove the attachment"
                            className="ml-auto rounded p-0.5 hover:bg-muted"
                        >
                            <X className="size-3" aria-hidden />
                        </button>
                    </div>
                )}

                <div className="relative flex items-end gap-2">
                    {showPicker && (
                        <CannedPicker
                            replies={canned}
                            query={cannedQuery ?? ""}
                            onPick={pickCanned}
                            onDismiss={() => setPickerOpen(false)}
                        />
                    )}
                    <Textarea
                        ref={textareaRef}
                        value={text}
                        rows={2}
                        placeholder="Type a reply — press / for a canned reply"
                        aria-label="Reply to this chat"
                        className="min-h-[44px] flex-1 resize-none"
                        onChange={(event) => onType(event.target.value, event.target.selectionStart ?? event.target.value.length)}
                        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
                        onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
                        onBlur={() => publishTyping(false)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") setPickerOpen(false);
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                void send();
                            }
                        }}
                    />
                    <input
                        ref={fileRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        aria-label="Attach an image or PDF"
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void attach(file);
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Attach an image or PDF"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                    >
                        {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Canned replies"
                        onClick={() => setPickerOpen((open) => !open)}
                    >
                        <MessageSquareText className="size-4" aria-hidden />
                    </Button>
                    <Button type="button" size="icon" aria-label="Send" disabled={sending || (!text.trim() && !pendingFile)} onClick={() => void send()}>
                        {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
                    </Button>
                </div>
            </div>
        </Card>
    );
}
