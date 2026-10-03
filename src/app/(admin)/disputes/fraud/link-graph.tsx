"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Images, Link2, Network, Phone, Smartphone, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import {
    ATTRIBUTE_GLYPH,
    GRAPH_DEFAULT_WIDTH,
    GRAPH_NARROW_WIDTH,
    GRAPH_NODE_RADIUS,
    attributeGroups,
    fraudGraphLayout,
    sharedByLabel,
    signalLabel,
    subjectHref,
    type FraudGraph,
    type GraphNode,
    type LinkedAccount,
    type LinkedAccountsRead,
    type SharedAttribute,
} from "@/services/fraud";
import { PARTY_LABEL } from "@/services/suspension";

/**
 * The link graph of DR 10 "Fraud Investigation" (5102:27407), rebuilt
 * 28 Sep 2026 after the owner's "words are overlapping — the whole graph
 * needs to be responsive".
 *
 * Bipartite, as the frame draws it: the accounts (red ring, two letters, the
 * name under the circle) joined by plain grey lines to the SHARED ATTRIBUTES
 * between them (amber — "PAN ••••234F · shared with 3"), the parties the last
 * scoring compared and cleared standing apart on the right ("Zepto · no
 * link"). The card is measured (`ResizeObserver`) and the graph is laid out
 * for its real width by `fraudGraphLayout` — never scaled, so the text stays
 * 11 px — and below 520 px (`GRAPH_NARROW_WIDTH`) the card lists the
 * attribute groups instead.
 * Every node is focusable; hovering or focusing one lights its edges and
 * opens a small card (type, KYC, wallet, open bookings). Clicking an
 * attribute or "+N more" filters the Linked accounts table beneath and
 * scrolls to it.
 */

/** What the Linked accounts table is narrowed to — an attribute, or the accounts the graph did not draw. */
export type AccountsFilter = { kind: "signal"; signal: string } | { kind: "undrawn"; keys: string[] } | null;

const R = GRAPH_NODE_RADIUS;

/** The icon in an attribute's circle where the frame has no glyph ("ID" and "₹" are text). */
const ATTRIBUTE_ICON: Record<string, LucideIcon> = {
    SHARED_DEVICE: Smartphone,
    SHARED_IP_SUBNET: Network,
    SHARED_PHONE_ACROSS_ROLES: Phone,
    DUPLICATE_LISTING_PHOTOS: Images,
    SELF_DEALING: ArrowLeftRight,
};

const partyKey = (party: { type: string; id: string }) => `${party.type}:${party.id}`;

/** "PENDING_REVIEW" → "Pending review". */
export function kycLabel(status: string | null | undefined): string {
    if (!status) return "No KYC";
    const words = status.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** The element's content width, kept current with a `ResizeObserver`; null until it has been measured. */
function useMeasuredWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
    const ref = React.useRef<T | null>(null);
    const [width, setWidth] = React.useState<number | null>(null);
    useIsomorphicLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const take = (next: number) => {
            if (next > 0) setWidth((previous) => (previous !== null && Math.abs(previous - next) < 1 ? previous : Math.floor(next)));
        };
        take(element.getBoundingClientRect().width);
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) take(entry.contentRect.width);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, width];
}

/**
 * The graph (or, narrow, the list), for the card's measured width. Before
 * the first measurement — a server render, a test — it lays out at 760 px.
 */
export function LinkedGraph({ read, onShowAccounts }: { read: LinkedAccountsRead; onShowAccounts: (filter: AccountsFilter) => void }) {
    const [ref, measured] = useMeasuredWidth<HTMLDivElement>();
    const width = measured ?? GRAPH_DEFAULT_WIDTH;
    const narrow = measured !== null && measured < GRAPH_NARROW_WIDTH;
    const graph = React.useMemo(() => fraudGraphLayout(read, { width }), [read, width]);
    return (
        <div ref={ref} className="mt-3 min-w-0" data-width={width}>
            {narrow ? <AttributeList read={read} onShowAccounts={onShowAccounts} /> : <GraphCanvas read={read} graph={graph} onShowAccounts={onShowAccounts} />}
        </div>
    );
}

function nodeAriaLabel(node: GraphNode): string {
    switch (node.kind) {
        case "subject":
        case "account": {
            const shares = node.via.map(signalLabel).join(", ");
            return `${node.title}, ${PARTY_LABEL[node.party!.type].toLowerCase()}, ${node.kind === "subject" ? "subject of the case" : "flagged"}${shares ? `, shares ${shares}` : ""}`;
        }
        case "attribute":
            return `${node.attribute!.display}, ${node.attribute!.label}, ${sharedByLabel(node.attribute!)}. Show the accounts that share it`;
        case "clean":
            return `${node.title}, ${PARTY_LABEL[node.party!.type].toLowerCase()}, compared by the last scoring and not linked`;
        case "more":
            return node.moreOf === "accounts" ? `${node.title}. Show them in the Linked accounts table` : `${node.title}. Listed under the Linked accounts table`;
    }
}

function GraphCanvas({ read, graph, onShowAccounts }: { read: LinkedAccountsRead; graph: FraudGraph; onShowAccounts: (filter: AccountsFilter) => void }) {
    const [active, setActive] = React.useState<string | null>(null);
    const byKey = React.useMemo(() => new Map(graph.nodes.map((node) => [node.key, node])), [graph]);
    const activeNode = active ? byKey.get(active) ?? null : null;
    const lit = React.useMemo(() => {
        if (!active) return null;
        const keys = new Set([active]);
        for (const edge of graph.edges) {
            if (edge.from === active) keys.add(edge.to);
            if (edge.to === active) keys.add(edge.from);
        }
        return keys;
    }, [active, graph.edges]);

    const enter = (key: string) => () => setActive(key);
    const leave = (key: string) => () => setActive((current) => (current === key ? null : current));
    const activate = (node: GraphNode) => {
        if (node.kind === "attribute") onShowAccounts({ kind: "signal", signal: node.signal! });
        else if (node.kind === "more" && node.moreOf === "accounts") onShowAccounts({ kind: "undrawn", keys: graph.undrawn.map((account) => partyKey(account.party)) });
        else if (node.kind === "more") onShowAccounts(null);
    };
    const linkedCount = read.linked.length;
    const cleanCount = graph.nodes.filter((node) => node.kind === "clean").length + graph.undrawnClean.length;

    return (
        <div className="relative" data-testid="fraud-graph-canvas">
            <svg
                width={graph.width}
                height={graph.height}
                viewBox={`0 0 ${graph.width} ${graph.height}`}
                className="block max-w-none select-none overflow-visible"
                role="group"
                aria-label={`Link graph: ${read.subject.name ?? read.subject.id} and ${linkedCount} linked account${linkedCount === 1 ? "" : "s"} through ${graph.attributes.length} shared attribute${graph.attributes.length === 1 ? "" : "s"}${cleanCount ? `; ${cleanCount} compared and clean` : ""}`}
            >
                <g aria-hidden>
                    {graph.edges.map((edge) => {
                        const from = byKey.get(edge.from)!;
                        const to = byKey.get(edge.to)!;
                        const on = lit !== null && (edge.from === active || edge.to === active);
                        return (
                            <line
                                key={`${edge.from}->${edge.to}`}
                                x1={from.x}
                                y1={from.y}
                                x2={to.x}
                                y2={to.y}
                                className={cn(
                                    "transition-opacity",
                                    on ? "stroke-muted-foreground" : "stroke-muted-foreground/35",
                                    lit !== null && !on && "opacity-30"
                                )}
                                strokeWidth={on ? 1.5 : 1}
                                strokeDasharray={edge.dashed ? "4 4" : undefined}
                                data-testid="fraud-graph-edge"
                            />
                        );
                    })}
                </g>
                {graph.nodes.map((node) => {
                    const dim = lit !== null && !lit.has(node.key);
                    const handlers = {
                        onMouseEnter: enter(node.key),
                        onMouseLeave: leave(node.key),
                        onFocus: enter(node.key),
                        onBlur: leave(node.key),
                    };
                    const body = <NodeBody node={node} active={active === node.key} />;
                    const className = cn("cursor-pointer outline-none transition-opacity", dim && "opacity-40");
                    if (node.party) {
                        return (
                            <Link
                                key={node.key}
                                href={subjectHref(node.party.type, node.party.id)}
                                aria-label={nodeAriaLabel(node)}
                                className={className}
                                data-testid="fraud-graph-node"
                                data-kind={node.kind}
                                {...handlers}
                            >
                                {body}
                            </Link>
                        );
                    }
                    return (
                        <g
                            key={node.key}
                            role="button"
                            tabIndex={0}
                            aria-label={nodeAriaLabel(node)}
                            className={className}
                            data-testid="fraud-graph-node"
                            data-kind={node.kind}
                            onClick={() => activate(node)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    activate(node);
                                }
                            }}
                            {...handlers}
                        >
                            {body}
                        </g>
                    );
                })}
            </svg>
            {activeNode && <HoverCard node={activeNode} graph={graph} read={read} />}
        </div>
    );
}

/** One node: its circle, what sits in it, its caption (with a halo so a line never runs through the words), and its tooltip. */
function NodeBody({ node, active }: { node: GraphNode; active: boolean }) {
    const tone =
        node.kind === "subject" || node.kind === "account"
            ? { circle: "fill-danger-soft stroke-danger", text: "fill-danger" }
            : node.kind === "attribute"
              ? { circle: "fill-warning-soft stroke-warning", text: "fill-warning" }
              : node.kind === "clean"
                ? { circle: "fill-card stroke-border", text: "fill-muted-foreground" }
                : { circle: "fill-muted stroke-muted-foreground/50", text: "fill-muted-foreground" };
    const Icon = node.kind === "attribute" && !ATTRIBUTE_GLYPH[node.signal!] ? ATTRIBUTE_ICON[node.signal!] ?? Link2 : null;
    const showCaption = node.caption.length > 0 && (!node.captionHidden || active);
    return (
        <>
            <title>{node.title}</title>
            {active && <circle cx={node.x} cy={node.y} r={R + 5} className="fill-none stroke-ring" strokeWidth={2} />}
            {node.kind === "subject" && <circle cx={node.x} cy={node.y} r={R + 3} className="fill-none stroke-danger/30" strokeWidth={1.5} />}
            <circle
                cx={node.x}
                cy={node.y}
                r={R}
                className={cn(tone.circle, "drop-shadow-sm")}
                strokeWidth={2}
                strokeDasharray={node.kind === "more" ? "4 3" : undefined}
            />
            {Icon ? (
                <Icon x={node.x - 8} y={node.y - 8} width={16} height={16} className="stroke-warning" aria-hidden />
            ) : (
                <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize={12} className={cn("font-bold", tone.text)}>
                    {node.initials}
                </text>
            )}
            {showCaption &&
                node.caption.map((line, i) => (
                    <text
                        key={i}
                        x={node.captionX}
                        y={node.captionY + i * 14}
                        textAnchor="middle"
                        fontSize={11}
                        paintOrder="stroke"
                        strokeWidth={3}
                        strokeLinejoin="round"
                        className={cn(
                            "stroke-card",
                            node.kind === "subject" && i === 0 ? "fill-foreground font-medium" : "fill-muted-foreground"
                        )}
                        data-testid="fraud-graph-caption"
                    >
                        {line}
                    </text>
                ))}
        </>
    );
}

const CARD_WIDTH = 232;

/** The small card beside a hovered or focused node — what the old per-account cards under the graph showed. */
function HoverCard({ node, graph, read }: { node: GraphNode; graph: FraudGraph; read: LinkedAccountsRead }) {
    const flip = node.x + R + 12 + CARD_WIDTH > graph.width;
    const left = Math.max(0, flip ? node.x - R - 12 - CARD_WIDTH : node.x + R + 12);
    const top = Math.max(0, node.y - R);
    return (
        <div
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md"
            style={{ left, top, width: CARD_WIDTH }}
            data-testid="fraud-graph-card"
        >
            <NodeDetail node={node} read={read} graph={graph} />
        </div>
    );
}

function NodeDetail({ node, read, graph }: { node: GraphNode; read: LinkedAccountsRead; graph: FraudGraph }) {
    if (node.kind === "attribute") {
        const attribute = node.attribute!;
        const sharers = read.linked.filter((account) => account.via.includes(attribute.signal));
        return (
            <>
                <p className="text-sm font-medium text-foreground">{attribute.display}</p>
                <p className="mt-0.5 text-muted-foreground">
                    {attribute.label} · {sharedByLabel(attribute)}
                </p>
                <p className="mt-2 text-muted-foreground">
                    Held by {read.subject.name ?? read.subject.id} and {sharers.length} linked account{sharers.length === 1 ? "" : "s"}
                    {sharers.length ? `: ${sharers.slice(0, 5).map((account) => account.party.name ?? account.party.id).join(", ")}${sharers.length > 5 ? ` and ${sharers.length - 5} more` : ""}` : ""}.
                </p>
            </>
        );
    }
    if (node.kind === "more") {
        return (
            <>
                <p className="text-sm font-medium text-foreground">{node.title}</p>
                <p className="mt-1 text-muted-foreground">
                    {node.moreOf === "accounts"
                        ? `Fewer signals than the ${graph.nodes.filter((n) => n.kind === "account").length} drawn. Every one is in the Linked accounts table below.`
                        : `${graph.undrawnClean.map((party) => party.name ?? party.id).slice(0, 6).join(", ")}${graph.undrawnClean.length > 6 ? "…" : ""}`}
                </p>
            </>
        );
    }
    const party = node.party!;
    const shares = node.via.map(signalLabel);
    return (
        <>
            <p className="text-sm font-medium text-foreground">{node.title}</p>
            <p className="mt-0.5 text-muted-foreground">
                {PARTY_LABEL[party.type]} ·{" "}
                {node.kind === "subject" ? (
                    <span className="text-danger">Subject of the case</span>
                ) : node.kind === "clean" ? (
                    "Compared, no link"
                ) : (
                    <span className="text-danger">Flagged</span>
                )}
            </p>
            {node.kind !== "clean" && (
                <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1">
                    <div>
                        <dt className="text-muted-foreground">KYC</dt>
                        <dd className="font-medium text-foreground">{kycLabel(node.kycStatus)}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Wallet</dt>
                        <dd className="font-medium tabular-nums text-foreground">
                            {node.kind === "subject" ? "—" : node.walletBalance === null ? "No wallet" : formatMoney(node.walletBalance)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Open</dt>
                        <dd className="font-medium tabular-nums text-foreground">{node.kind === "subject" ? "—" : (node.openBookings ?? 0)}</dd>
                    </div>
                </dl>
            )}
            {node.kind === "account" && shares.length > 0 && <p className="mt-2 text-muted-foreground">Shares {shares.join(", ")}</p>}
            {node.kind === "clean" && <p className="mt-1 text-muted-foreground">Compared by the last scoring; no shared attribute found.</p>}
        </>
    );
}

/** The attribute's circle at list size — the same glyph or icon the graph draws. */
function AttributeBadge({ signal }: { signal: string }) {
    const glyph = ATTRIBUTE_GLYPH[signal];
    const Icon = glyph ? null : ATTRIBUTE_ICON[signal] ?? Link2;
    return (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-warning bg-warning-soft text-[11px] font-bold text-warning" aria-hidden>
            {Icon ? <Icon className="size-3.5" /> : glyph}
        </span>
    );
}

/** How many names an attribute group lists before "and N more" (the table has them all). */
const LIST_NAMES = 8;

/** Below 520 px: each shared attribute and the accounts that hold it, then the clean parties. */
function AttributeList({ read, onShowAccounts }: { read: LinkedAccountsRead; onShowAccounts: (filter: AccountsFilter) => void }) {
    const groups = attributeGroups(read);
    const clean = (read.evaluated ?? []).map((row) => row.party);
    const subjectName = read.subject.name ?? read.subject.id;
    return (
        <ul className="space-y-2" data-testid="fraud-graph-list" aria-label="Shared attributes and the accounts that hold them">
            {groups.map(({ attribute, accounts }) => (
                <li key={attribute.signal} className="rounded-md border border-border px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <AttributeBadge signal={attribute.signal} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{attribute.display}</p>
                            <p className="text-xs text-muted-foreground">
                                {attribute.label} · {sharedByLabel(attribute)}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            onClick={() => onShowAccounts({ kind: "signal", signal: attribute.signal })}
                        >
                            In the table
                        </button>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium text-foreground">{subjectName}</span> (subject)
                        {accounts.slice(0, LIST_NAMES).map((account) => (
                            <React.Fragment key={partyKey(account.party)}>
                                {", "}
                                <Link href={subjectHref(account.party.type, account.party.id)} className="text-danger underline-offset-2 hover:underline">
                                    {account.party.name ?? account.party.id}
                                </Link>
                            </React.Fragment>
                        ))}
                        {accounts.length > LIST_NAMES && (
                            <>
                                {" and "}
                                <button
                                    type="button"
                                    className="underline underline-offset-2 hover:text-foreground"
                                    onClick={() => onShowAccounts({ kind: "signal", signal: attribute.signal })}
                                >
                                    {accounts.length - LIST_NAMES} more
                                </button>
                            </>
                        )}
                    </p>
                </li>
            ))}
            {clean.length > 0 && (
                <li className="px-1 text-xs text-muted-foreground">
                    Compared and clean: {clean.map((party) => party.name ?? party.id).join(", ")}
                </li>
            )}
        </ul>
    );
}

function sharesOf(account: LinkedAccount, attributes: Map<string, SharedAttribute>): string[] {
    return account.via.map((signal) => attributes.get(signal)?.display ?? signalLabel(signal));
}

/** The table shows this many rows until "Show all"; a filter shows every match. */
const TABLE_ROWS = 8;

/**
 * The Linked accounts table under the graph: every account the read
 * linked — drawn or behind "+N more" — with what it shares, its KYC, its
 * wallet and its open bookings (the figures the value at risk is summed
 * from). An attribute or "+N more" on the graph narrows it.
 */
export function LinkedAccountsTable({
    read,
    filter,
    onClearFilter,
    ref,
}: {
    read: LinkedAccountsRead;
    filter: AccountsFilter;
    onClearFilter: () => void;
    ref?: React.Ref<HTMLDivElement>;
}) {
    const attributes = React.useMemo(() => new Map(attributeGroups(read).map((group) => [group.attribute.signal, group.attribute])), [read]);
    const [expanded, setExpanded] = React.useState(false);
    const rows = read.linked.filter((account) =>
        filter === null ? true : filter.kind === "signal" ? account.via.includes(filter.signal) : filter.keys.includes(partyKey(account.party))
    );
    const shown = filter !== null || expanded ? rows : rows.slice(0, TABLE_ROWS);
    const clean = (read.evaluated ?? []).map((row) => row.party);
    const filterLabel =
        filter === null
            ? null
            : filter.kind === "signal"
              ? `Sharing ${attributes.get(filter.signal)?.display ?? signalLabel(filter.signal)}`
              : "Not drawn on the graph";
    return (
        <Card ref={ref} tabIndex={-1} className="scroll-mt-24 rounded-lg border-border shadow-none outline-none" data-testid="fraud-linked-accounts">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Linked accounts <span className="font-normal normal-case tracking-normal">· {read.linked.length}</span>
                </h3>
                {filterLabel && (
                    <button
                        type="button"
                        onClick={onClearFilter}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted/70"
                        aria-label={`${filterLabel} — show every linked account`}
                    >
                        {filterLabel} ({rows.length})
                        <X className="size-3" aria-hidden />
                    </button>
                )}
            </div>
            {rows.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                                <th className="px-4 py-2 font-medium">Account</th>
                                <th className="px-3 py-2 font-medium">KYC</th>
                                <th className="px-3 py-2 text-right font-medium">Wallet</th>
                                <th className="px-4 py-2 text-right font-medium">Open</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((account) => (
                                <tr key={partyKey(account.party)} className="border-b last:border-0">
                                    <td className="px-4 py-2.5">
                                        <Link
                                            href={subjectHref(account.party.type, account.party.id)}
                                            className="line-clamp-1 font-medium text-foreground underline-offset-4 hover:underline"
                                            title={account.party.name ?? account.party.id}
                                        >
                                            {account.party.name ?? account.party.id}
                                        </Link>
                                        <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] text-muted-foreground">
                                            <span>{PARTY_LABEL[account.party.type]}</span>
                                            {sharesOf(account, attributes).map((share) => (
                                                <span key={share} className="whitespace-nowrap">
                                                    · {share}
                                                </span>
                                            ))}
                                        </p>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-foreground">{kycLabel(account.kycStatus)}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                                        {account.walletBalance === null ? <span className="text-xs text-muted-foreground">No wallet</span> : formatMoney(account.walletBalance)}
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{account.openBookings ?? 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No linked account matches.</p>
            )}
            {filter === null && rows.length > TABLE_ROWS && (
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="w-full border-t px-4 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                    {expanded ? "Show fewer" : `Show all ${rows.length}`}
                </button>
            )}
            {clean.length > 0 && (
                <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
                    Compared by the last scoring and clean: {clean.map((party) => party.name ?? party.id).join(", ")}
                </p>
            )}
        </Card>
    );
}
