import {
    ArrowUpDown,
    Award,
    BadgeIndianRupee,
    BarChart3,
    Bell,
    BookOpenCheck,
    CalendarClock,
    ClipboardCheck,
    Coins,
    Contact,
    FileCheck,
    KeyRound,
    FileSignature,
    FileText,
    House,
    IndianRupee,
    Landmark,
    Library,
    ListChecks,
    Map,
    MapPinned,
    Megaphone,
    MessageSquareText,
    Network,
    KanbanSquare,
    Radar,
    ReceiptText,
    Rocket,
    ScrollText,
    History,
    Send,
    Settings,
    Gauge,
    GraduationCap,
    Scale,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Package,
    Printer,
    QrCode,
    Tag,
    Tags,
    Undo2,
    Upload,
    CreditCard,
    TrendingUp,
    Trophy,
    UserCog,
    Users,
    UsersRound,
    Wallet,
    WalletCards,
    Workflow,
    type LucideIcon,
    Navigation,
    Ticket,
    LayoutTemplate,
    Images,
    BadgeDollarSign,
} from "lucide-react";

export interface NavItem {
    title: string;
    href: string;
    icon: LucideIcon;
    /**
     * Routes that live under this one.
     *
     * The sidebar deliberately does not render these — it is the Figma "ADX /
     * Sidebar" component, a flat rail of modules, and hanging six wallet
     * screens off Finance would both crowd it and break the active state, since
     * every `/finance/*` path already matches `/finance`. Sub-navigation inside
     * a section is the `SubNav` component's job, which is what `FinanceNav`
     * draws.
     *
     * They are declared here anyway so the section's real shape lives in one
     * file, and so `allNavItems` — and therefore ⌘K — can reach a screen that
     * is two clicks deep. Somebody looking for "Ledger" should not have to know
     * it is inside Finance.
     */
    children?: NavItem[];
}

export interface NavSection {
    id: string;
    items: NavItem[];
}

/**
 * Sidebar navigation, mirrors the Figma "ADX / Sidebar" component:
 * a marketplace section, a hairline divider, then the operations section.
 */
export const navigation: NavSection[] = [
    {
        id: "marketplace",
        items: [
            { title: "Dashboard", href: "/dashboard", icon: House },
            /* N3-C (the owner, 14 Sep): "Why is there a separate Activation
               section for publishers and then Demand section for
               advertisers? Why couldn't these sections be merged into their
               respective parent sections?" — they are funnel dashboards
               over the same parties, so they are tabs of their sections
               now (`PublishersNav` / `AdvertisersNav`), not rail rows.
               Children here so ⌘K still reaches them. */
            {
                title: "Publishers",
                href: "/publishers",
                icon: Tag,
                /* Package O-C: the row itself is the section's overview;
                   the directory moved to its own path beside it. */
                children: [
                    { title: "Publisher directory", href: "/publishers/directory", icon: Tag },
                    { title: "Publisher activation funnel", href: "/publishers/activation", icon: Rocket },
                    { title: "Import publishers", href: "/publishers/import", icon: Upload },
                ],
            },
            {
                title: "Advertisers",
                href: "/advertisers",
                icon: Tags,
                children: [
                    { title: "Advertiser directory", href: "/advertisers/directory", icon: Tags },
                    { title: "Advertiser activation funnel", href: "/advertisers/activation", icon: Wallet },
                    { title: "Import advertisers", href: "/advertisers/import", icon: Upload },
                ],
            },
            /* Lot H's partner floor. Third side of the marketplace, so it sits
               with the other two (the owner, 24 September): publishers supply
               the space, advertisers buy it, print partners print and install
               what goes up. The work that flows between them follows. */
            {
                title: "Print partners",
                href: "/print-partners",
                icon: Printer,
                /* Package O-C: the overview at the root; the roster and the quote requests are routes of their own. */
                children: [
                    { title: "Print partner directory", href: "/print-partners/directory", icon: Printer },
                    { title: "Print quote requests", href: "/print-partners/quote-requests", icon: Printer },
                    { title: "Import print partners", href: "/print-partners/import", icon: Upload },
                ],
            },
            {
                title: "Agents",
                href: "/agents",
                icon: Network,
                /* Package O-C: the overview at the root, the roster beside it. */
                children: [
                    { title: "Agent directory", href: "/agents/directory", icon: Network },
                    { title: "Import agents", href: "/agents/import", icon: Upload },
                ],
            },
            /* Beside Agents (the owner, 24 September): both are the people who
               work for ADX rather than trade on it — the agents in the field,
               then the staff. HR itself lives in the HR tool, reached by
               portal link; the console keeps the directory, the departments it
               groups into and the holiday calendar the diary shades. Children
               so ⌘K can reach the tabs. */
            {
                title: "Employees",
                href: "/employees",
                icon: Contact,
                children: [
                    { title: "Employee directory", href: "/employees/directory", icon: Contact },
                    { title: "Departments", href: "/employees/departments", icon: Network },
                    { title: "Holidays", href: "/employees/holidays", icon: CalendarClock },
                    { title: "Import employees", href: "/employees/import", icon: Upload },
                ],
            },
            /* Between Agents and Listings because that is the order the work
               happens in: an agent finds a business, the business becomes a
               publisher or an advertiser, and the spot becomes a listing. */
            { title: "Leads", href: "/leads", icon: Radar },
            /* The trip a lead turns into. Beside Leads because that is where a
               visit comes from, and before Listings because the spot is what
               the visit produces. */
            { title: "Visits", href: "/visits", icon: MapPinned },
            /* One row for one section (the owner, 25 September: "Listings and
               listing review are part of same thing"). Review, Verification,
               Renewals and Claims were already tabs of this section
               with routes under `/listings`; two of them were also rail rows
               in operations, which lit two rows at once and said the operator
               was in two places. They are children here now: the tab bar is
               where they are actually used, and ⌘K still reaches them. */
            {
                title: "Listings",
                href: "/listings",
                icon: Map,
                /* 2 Oct 2026: in the tab bar's order — the overview is the row
                   itself, the table moved to /listings/directory, and Drafts
                   became a status of that table rather than a desk of its own. */
                children: [
                    { title: "Listing directory", href: "/listings/directory", icon: FileText },
                    { title: "Listing review", href: "/listings/review", icon: ClipboardCheck },
                    { title: "Verification", href: "/listings/verification", icon: ShieldCheck },
                    { title: "Renewals", href: "/listings/renewals", icon: History },
                    { title: "Claims", href: "/listings/claims", icon: FileCheck },
                    /* Package U: a publisher's listings or rate card, on the import kit. */
                    { title: "Import listings", href: "/listings/import", icon: Upload },
                ],
            },
            /* The trade, in the owner's order (24 September): the campaign,
               the orders that put it up, and the plans and packages bought
               around it. Bookings went on 25 September: there was no booking
               record — /bookings read GET /orders and its rows opened
               /orders/:id — so it was the same list drawn twice, and the
               better half of each copy is the Orders list now. */
            {
                title: "Campaigns",
                href: "/campaigns",
                icon: ArrowUpDown,
                /* Lot E (Q106): the landing-page review desk. A child rather
                   than a rail row, the way the order pipeline sits under
                   Orders — every /campaigns/* path already matches the parent.
                   2 Oct 2026: in the tab bar's order — the overview is the row
                   itself, the list moved to /campaigns/directory, and the
                   launch queue joined between them. */
                children: [
                    { title: "Campaign directory", href: "/campaigns/directory", icon: FileText },
                    { title: "Launch queue", href: "/campaigns/launch-queue", icon: Rocket },
                    { title: "Landing pages", href: "/campaigns/landing-pages", icon: Megaphone },
                ],
            },
            {
                title: "Orders",
                href: "/orders",
                icon: ReceiptText,
                /* Children rather than rail rows: every /orders/* path already
                   matches the parent, and ⌘K reaches the two views. */
                children: [
                    { title: "Order calendar", href: "/orders/calendar", icon: CalendarClock },
                    { title: "Order pipeline", href: "/orders/pipeline", icon: KanbanSquare },
                ],
            },
            /* DR 06's package book, and Lot J-C's desks beside it: the plans of
               both user types and the publisher subscriptions — what an
               advertiser buys before a campaign, and what a publisher buys for
               the rate on their bookings. */
            {
                title: "Plans & subscriptions",
                href: "/packages/catalogue",
                icon: Package,
                /* Children rather than rail rows of their own, the way the
                   order pipeline sits under Orders: every /packages/* path
                   already matches the parent. */
                children: [
                    { title: "Subscription plans", href: "/packages/catalogue", icon: Package },
                    { title: "Publisher subscriptions", href: "/packages/subscriptions", icon: BadgeIndianRupee },
                    { title: "Package sales", href: "/packages/sales", icon: Package },
                ],
            },
            /* AS-1 (the owner, 27 September): the ads ADX sells — display
               ads in its slots and listings their owners pay to show first —
               are a product, so they sit with the others ADX sells rather
               than behind a Growth tab (Growth configures the levers for
               ADX's own people). The row opens the Overview; the tabs are
               children so ⌘K reaches them and every /ads/* path lights it. */
            {
                title: "Ads & sponsored",
                href: "/ads",
                icon: BadgeDollarSign,
                children: [
                    { title: "Ads overview", href: "/ads", icon: BadgeDollarSign },
                    { title: "Ad review queue", href: "/ads/review", icon: ClipboardCheck },
                    { title: "Display ads", href: "/ads/display", icon: Megaphone },
                    { title: "Sponsored listings", href: "/ads/sponsored", icon: Rocket },
                    { title: "Ad slots & pricing", href: "/ads/slots", icon: IndianRupee },
                ],
            },
            /* LT-1: where every working agent is — the agent app's position on a
               job, states, alerts, trails, the order timeline. Beside Orders
               because that is the work it watches. */
            { title: "Live map", href: "/live-map", icon: Navigation },
        ],
    },
    {
        id: "operations",
        items: [
            /* The review desks that are sections of their own, together (the
               owner, 24 September). Listing review and Verification left on
               25 September: they were never separate sections — both are tabs
               of Listings with routes under it — so they went back to it, and
               these two are what remain. */
            /* Advertisers' artwork, not ADX's own writing — "Content review"
               read as the CMS the moment Content existed (owner, 24 Sep).
               CR-1 (25 Sep): a section, because review was one of four
               things the desk had to see and the other three were invisible —
               the designs ADX owes when an advertiser chooses ADX Design
               Agency sat at PENDING_UPLOAD, which the queue hid; delivered
               designs waiting on the advertiser had no chase list; and
               nothing showed whether approved artwork had reached a shop. */
            {
                title: "Creatives",
                href: "/creatives",
                icon: Megaphone,
                children: [
                    { title: "Creative review", href: "/creatives", icon: Megaphone },
                    { title: "Design requests", href: "/creatives/design-requests", icon: Megaphone },
                    { title: "Awaiting advertiser", href: "/creatives/awaiting-advertiser", icon: Megaphone },
                    { title: "Print-ready artwork", href: "/creatives/print-ready", icon: Printer },
                ],
            },
            { title: "KYC Queue", href: "/kyc", icon: FileCheck },
            { title: "Access grants", href: "/access", icon: KeyRound },
            /* The contracts a party actually accepts or signs — with ADX, for
               listing a spot, printing, employment, an engagement or a paid
               campaign. The owner's words (24 Sep): this is what a legal
               document is. The route stays /agreements. */
            {
                title: "Legal documents",
                href: "/legal-documents",
                icon: FileSignature,
                /* Each screen is its own row behind the SubNav, so ⌘K can reach
                   it; the sidebar draws the module row only. */
                children: [
                    { title: "Contract templates", href: "/legal-documents", icon: FileSignature },
                    { title: "Signed and accepted", href: "/legal-documents/acceptances", icon: ScrollText },
                    { title: "Stale terms", href: "/legal-documents/stale", icon: History },
                    { title: "Signatures", href: "/legal-documents/signatures", icon: Scale },
                ],
            },
            /* Everything ADX publishes to be read and nobody signs: the pages
               (CT-1) and the thirteen policies, two tabs of one section.
               PB-1 (27 Sep 2026): Pages is the Studio index now — every
               address the website answers, edited in Studio; the text pages
               the CMS held are Articles; and Forms is their own builder
               ("forms get their OWN builder"). */
            {
                title: "Content",
                href: "/content",
                icon: FileText,
                children: [
                    { title: "Pages", href: "/content", icon: FileText },
                    { title: "Articles", href: "/content/articles", icon: FileText },
                    { title: "Forms", href: "/content/forms", icon: ListChecks },
                    { title: "Policies", href: "/content/policies", icon: Scale },
                    /* LM-1 (27 Sep 2026): what each screen draws, and the pictures it draws with. */
                    { title: "Layouts", href: "/content/layouts", icon: LayoutTemplate },
                    { title: "Media library", href: "/content/media", icon: Images },
                ],
            },
            {
                title: "Finance",
                href: "/finance",
                icon: Coins,
                children: [
                    { title: "Withdrawal approvals", href: "/finance", icon: Wallet },
                    { title: "Wallets", href: "/finance/wallets", icon: WalletCards },
                    { title: "Ledger", href: "/finance/ledger", icon: BookOpenCheck },
                    { title: "Payout methods", href: "/finance/payout-methods", icon: Landmark },
                    { title: "Agent incentives", href: "/finance/incentives", icon: BadgeIndianRupee },
                    { title: "Refund desk", href: "/finance/refunds", icon: Undo2 },
                    { title: "Payments", href: "/finance/payments", icon: CreditCard },
                    { title: "Finance settings", href: "/finance/settings", icon: SlidersHorizontal },
                ],
            },
            { title: "Pricing", href: "/pricing", icon: IndianRupee },
            { title: "Comms", href: "/comms", icon: Send },
            {
                title: "Users",
                href: "/users",
                icon: Users,
                /* Package O-C: the overview at the root; the accounts directory and the three desks beside it. */
                children: [
                    { title: "User accounts", href: "/users/accounts", icon: Users },
                    { title: "Admin users", href: "/users/admins", icon: UserCog },
                    /* Roles & permissions is what an admin user may do; it sits beside
                       the people who hold one (was its own rail row at `/roles`). */
                    { title: "Roles & permissions", href: "/users/roles", icon: UserCog },
                    { title: "Closure cases", href: "/users/closures", icon: Users },
                    { title: "Erasure requests", href: "/users/erasure", icon: Users },
                ],
            },
            {
                title: "QR codes",
                href: "/qr",
                icon: QrCode,
                /* K-B1: the desk over every signed code. The Scans screen
                   is its own route behind the SubNav (a person's page links
                   there with `?scannedById=`), listed here so the palette
                   can reach it; the rail draws the row only. */
                children: [
                    { title: "QR codes", href: "/qr", icon: QrCode },
                    { title: "QR scans", href: "/qr/scans", icon: QrCode },
                ],
            },
            {
                title: "Settings",
                href: "/settings",
                icon: Settings,
                children: [
                    { title: "App status", href: "/settings/app-status", icon: Gauge },
                    { title: "Identifiers", href: "/settings/identifiers", icon: Settings },
                    { title: "Geographies", href: "/settings/geographies", icon: MapPinned },
                    { title: "Feature flags", href: "/settings/flags", icon: Settings },
                    { title: "System health", href: "/settings/system-health", icon: Gauge },
                    /* Package U: every import kind's file format in one place. */
                    { title: "Import formats", href: "/settings/import-formats", icon: Upload },
                    /* CF-1 (27 Sep 2026): the extra questions asked of a publisher, an advertiser, a listing or a lead. */
                    { title: "Custom fields", href: "/settings/custom-fields", icon: SlidersHorizontal },
                ],
            },
            /* The operator's own feed. The bell opens the drawer; this row is
               the centre behind it, where the kind chips and the Preferences
               card are, so the palette and the rail can reach it too. */
            { title: "Notifications", href: "/notifications", icon: Bell },
        ],
    },
    {
        id: "workspace",
        items: [
            /* Lot AA (15 Sep): the DR 10 Tasks section, on the work module. */
            { title: "Tasks", href: "/tasks", icon: ListChecks },
            { title: "Schedule", href: "/schedule", icon: CalendarClock },
            /* The day's work and what you read about it (the owner, 24
               September): who is asking for help, what went wrong, the numbers,
               and the trail of who did what. */
            {
                title: "Support",
                href: "/support",
                icon: MessageSquareText,
                /* The safety queue is its own screen behind the SubNav, so ⌘K
                   can reach it; the sidebar draws the module row only. */
                children: [
                    { title: "Support tickets", href: "/support", icon: MessageSquareText },
                    /* Lot I: the live desk and the replies its composer inserts. */
                    { title: "Live chat", href: "/support/live", icon: MessageSquareText },
                    { title: "Canned replies", href: "/support/canned", icon: MessageSquareText },
                    { title: "Safety reports", href: "/support/safety", icon: ShieldAlert },
                ],
            },
            { title: "Disputes", href: "/disputes", icon: ShieldAlert },
            {
                title: "Analytics",
                href: "/analytics",
                icon: BarChart3,
                /* Reports moved here from Settings on 24 September (the owner:
                   "isn't it same as analytics almost? Then why is it present
                   separately inside settings?"). It was absent from this file
                   entirely, so ⌘K could not reach it and the Settings tab bar
                   was the only door. Children rather than rail rows, the way
                   the order pipeline sits under Orders: every /analytics/*
                   path already matches the parent. */
                children: [
                    { title: "Explore", href: "/analytics/explore", icon: BarChart3 },
                    { title: "Reports", href: "/analytics/reports", icon: ScrollText },
                    { title: "Onboarding board", href: "/analytics/leaderboards", icon: Trophy },
                    { title: "Agent leaderboard", href: "/analytics/leaderboards/agents", icon: Trophy },
                ],
            },
            { title: "Audit log", href: "/audit", icon: ScrollText },
            /* What ADX runs for its own people rather than a queue it works
               (the owner, 24 September): the levers that motivate agents, and
               the curriculum they learn from. */
            {
                title: "Growth CMS",
                href: "/growth",
                icon: UsersRound,
                /* DR 05's levers behind one rail row: the milestone templates
                   the row opens, the tier ladder and the promo codes. The
                   section's SubNav draws the tabs; these are here so the
                   palette can reach the ones behind it. The ads ADX sells
                   left for their own section on 27 September (AS-1). */
                children: [
                    { title: "Milestones", href: "/growth", icon: UsersRound },
                    { title: "Tier ladder", href: "/growth/ladder", icon: TrendingUp },
                    /* PC-1 (DR 12): the codes advertisers type on Review & pay. */
                    { title: "Promo codes", href: "/growth/promo-codes", icon: Ticket },
                ],
            },
            {
                title: "Training",
                href: "/training",
                icon: GraduationCap,
                /* DR 05's curriculum desk, beside Growth: the modules the row
                   opens, who has passed them, and the flat library both apps
                   read. No DR 10 frame covers the desk; the SubNav draws the
                   tabs. */
                children: [
                    { title: "Training modules", href: "/training", icon: GraduationCap },
                    { title: "Certifications", href: "/training/certifications", icon: Award },
                    { title: "Training library", href: "/training/library", icon: Library },
                ],
            },
            { title: "Flow Editor", href: "/flows", icon: Workflow },
        ],
    },
];

/**
 * Every destination, flattened — sidebar modules first, then the screens nested
 * under them. Read by the command palette, which should be able to reach a
 * route whether or not the sidebar draws a row for it.
 *
 * A child whose href equals its parent's (Finance's own withdrawal queue) is
 * dropped, so ⌘K does not offer the same page twice under two names.
 */
export const allNavItems: NavItem[] = navigation.flatMap((section) =>
    section.items.flatMap((item) => [
        item,
        ...(item.children ?? []).filter((child) => child.href !== item.href),
    ])
);

/** Every row the rail actually draws, in order. */
export const railItems: NavItem[] = navigation.flatMap((section) => section.items);

/** How well a path matches an href: its length when it matches, else -1. */
function matchLength(pathname: string, href: string): number {
    if (pathname === href || pathname.startsWith(`${href}/`)) return href.length;
    return -1;
}

/**
 * Which rail row a path lights — the most specific one, exactly one.
 *
 * Two things went wrong with a plain prefix test on the row's own href.
 *
 * Some rows are ancestors of others: `/listings/review` is a review desk of
 * its own *and* sits under `/listings`, so both lit and the operator was told
 * they were in two places at once. The longest match wins now, which is the
 * rule the feature registry already uses for route prefixes.
 *
 * And some rows own paths that are not beneath them at all: "Plans &
 * subscriptions" points at `/packages/catalogue` while its siblings live at
 * `/packages/subscriptions`. Those lit nothing, so the rail went blank on a
 * page it owns. A row's declared `children` count as its own paths.
 *
 * Returns null only for a path the rail genuinely does not own.
 */
export function activeRailHref(pathname: string, rows: readonly NavItem[] = railItems): string | null {
    let best: string | null = null;
    let bestLength = -1;
    for (const row of rows) {
        /* A row is matched by its own href or by any path it declares. */
        let length = matchLength(pathname, row.href);
        for (const child of row.children ?? []) {
            length = Math.max(length, matchLength(pathname, child.href));
        }
        if (length > bestLength) {
            bestLength = length;
            best = row.href;
        }
    }
    return bestLength < 0 ? null : best;
}
