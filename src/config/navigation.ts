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
    Compass,
    Contact,
    FileCheck,
    KeyRound,
    FileSignature,
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
            /* Between Agents and Listings because that is the order the work
               happens in: an agent finds a business, the business becomes a
               publisher or an advertiser, and the spot becomes a listing. */
            { title: "Leads", href: "/leads", icon: Radar },
            /* The trip a lead turns into. Beside Leads because that is where a
               visit comes from, and before Listings because the spot is what
               the visit produces. */
            { title: "Visits", href: "/visits", icon: MapPinned },
            {
                title: "Listings",
                href: "/listings",
                icon: Map,
                children: [
                    { title: "Claims", href: "/listings/claims", icon: FileCheck },
                    /* Package U: a publisher's listings or rate card, on the import kit. */
                    { title: "Import listings", href: "/listings/import", icon: Upload },
                ],
            },
            {
                title: "Campaigns",
                href: "/campaigns",
                icon: ArrowUpDown,
                /* Lot E (Q106): the landing-page review desk. A child rather
                   than a rail row, the way the order pipeline sits under
                   Orders — every /campaigns/* path already matches the parent. */
                children: [{ title: "Landing pages", href: "/campaigns/landing-pages", icon: Megaphone }],
            },
            /* DR 06's package book, and Lot J-C's desks beside it: the plans
               of both user types and the publisher subscriptions. Beside
               Advertisers and Campaigns because a package is what an
               advertiser buys before a campaign, and a plan is what a
               publisher buys for the rate on their bookings. */
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
            { title: "Bookings", href: "/bookings", icon: Compass },
            {
                title: "Orders",
                href: "/orders",
                icon: ReceiptText,
                /* The kanban was reachable only from a button on /orders, so it
                   was absent from `allNavItems` and therefore from the command
                   palette. A child rather than a rail row: every /orders/* path
                   already matches the parent, which the sidebar's active state
                   depends on. */
                children: [{ title: "Order pipeline", href: "/orders/pipeline", icon: KanbanSquare }],
            },
            /* Lot H's partner floor. A rail row of its own rather than a
               Settings child (the owner, 14 September): the roster and the
               quote requests are a desk ops work at daily, beside the orders
               whose printing they serve, not a switch set once. */
            {
                title: "Print partners",
                href: "/print-partners",
                icon: Printer,
                /* Package O-C: the overview at the root; the roster and the quote requests are routes of their own. */
                children: [
                    { title: "Print partner roster", href: "/print-partners/roster", icon: Printer },
                    { title: "Print quote requests", href: "/print-partners/quote-requests", icon: Printer },
                    { title: "Import print partners", href: "/print-partners/import", icon: Upload },
                ],
            },
        ],
    },
    {
        id: "operations",
        items: [
            { title: "KYC Queue", href: "/kyc", icon: FileCheck, children: [{ title: "Onboarding intake", href: "/onboarding/submissions", icon: FileCheck }] },
            { title: "Access grants", href: "/access", icon: KeyRound },
            { title: "Verification", href: "/listings/verification", icon: ShieldCheck },
            { title: "Listing review", href: "/listings/review", icon: ClipboardCheck },
            {
                title: "Agreements",
                href: "/agreements",
                icon: FileSignature,
                /* The acceptances log is its own screen behind the SubNav, so ⌘K
                   can reach it; the sidebar draws the module row only. */
                children: [
                    { title: "Agreement templates", href: "/agreements", icon: FileSignature },
                    { title: "Agreement acceptances", href: "/agreements/acceptances", icon: ScrollText },
                    { title: "Stale terms", href: "/agreements/stale", icon: History },
                ],
            },
            /* Read, not accepted: the policies both apps show, and nobody signs. */
            { title: "Legal documents", href: "/legal", icon: Scale },
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
            { title: "Content Review", href: "/moderation", icon: Megaphone },
            { title: "Disputes", href: "/disputes", icon: ShieldAlert },
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
            { title: "Comms", href: "/comms", icon: Send },
            { title: "Analytics", href: "/analytics", icon: BarChart3 },
            {
                title: "Growth CMS",
                href: "/growth",
                icon: UsersRound,
                /* DR 05's three levers behind one rail row: the milestone
                   templates the row opens, the tier ladder and the city
                   leaderboard. The section's SubNav draws the tabs; these
                   are here so the palette can reach the two behind it. */
                children: [
                    { title: "Milestones", href: "/growth", icon: UsersRound },
                    { title: "Tier ladder", href: "/growth/ladder", icon: TrendingUp },
                    { title: "Leaderboard", href: "/growth/leaderboard", icon: Trophy },
                ],
            },
            {
                title: "Training",
                href: "/training",
                icon: GraduationCap,
                /* DR 05's curriculum desk, beside Growth because both are
                   what ADX does for its agents: the modules the row opens,
                   who has passed them, and the flat library both apps read.
                   No DR 10 frame covers the desk; the SubNav draws the tabs. */
                children: [
                    { title: "Training modules", href: "/training", icon: GraduationCap },
                    { title: "Certifications", href: "/training/certifications", icon: Award },
                    { title: "Training library", href: "/training/library", icon: Library },
                ],
            },
            {
                title: "Users",
                href: "/users",
                icon: Users,
                /* Package O-C: the overview at the root; the accounts directory and the three desks beside it. */
                children: [
                    { title: "User accounts", href: "/users/accounts", icon: Users },
                    { title: "Admin users", href: "/users/admins", icon: UserCog },
                    { title: "Closure cases", href: "/users/closures", icon: Users },
                    { title: "Erasure requests", href: "/users/erasure", icon: Users },
                ],
            },
            { title: "Roles", href: "/roles", icon: UserCog },
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
                ],
            },
            { title: "Audit log", href: "/audit", icon: ScrollText },
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
            {
                title: "Employees",
                href: "/employees",
                icon: Contact,
                /* Q98: HR lives in the HR tool, reached by portal link from
                   the overview; the console keeps the directory, the
                   departments it groups into and the holiday calendar the
                   diary shades. Children so ⌘K can reach the three tabs. */
                children: [
                    { title: "Employee directory", href: "/employees/directory", icon: Contact },
                    { title: "Departments", href: "/employees/departments", icon: Network },
                    { title: "Holidays", href: "/employees/holidays", icon: CalendarClock },
                    { title: "Import employees", href: "/employees/import", icon: Upload },
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
