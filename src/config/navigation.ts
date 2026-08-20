import {
    ArrowUpDown,
    BarChart3,
    CalendarClock,
    Coins,
    Compass,
    Contact,
    FileCheck,
    House,
    IndianRupee,
    ListChecks,
    Map,
    Megaphone,
    MessageSquareText,
    Network,
    ReceiptText,
    ScrollText,
    Send,
    Settings,
    ShieldAlert,
    Tag,
    Tags,
    UserCog,
    Users,
    UsersRound,
    Workflow,
    type LucideIcon,
} from "lucide-react";

export interface NavItem {
    title: string;
    href: string;
    icon: LucideIcon;
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
            { title: "Publishers", href: "/publishers", icon: Tag },
            { title: "Advertisers", href: "/advertisers", icon: Tags },
            { title: "Agents", href: "/agents", icon: Network },
            { title: "Listings", href: "/listings", icon: Map },
            { title: "Campaigns", href: "/campaigns", icon: ArrowUpDown },
            { title: "Bookings", href: "/bookings", icon: Compass },
            { title: "Orders", href: "/orders", icon: ReceiptText },
        ],
    },
    {
        id: "operations",
        items: [
            { title: "KYC Queue", href: "/kyc", icon: FileCheck },
            { title: "Finance", href: "/finance", icon: Coins },
            { title: "Pricing", href: "/pricing", icon: IndianRupee },
            { title: "Content Review", href: "/moderation", icon: Megaphone },
            { title: "Disputes", href: "/disputes", icon: ShieldAlert },
            { title: "Support", href: "/support", icon: MessageSquareText },
            { title: "Comms", href: "/comms", icon: Send },
            { title: "Analytics", href: "/analytics", icon: BarChart3 },
            { title: "Growth CMS", href: "/growth", icon: UsersRound },
            { title: "Users", href: "/users", icon: Users },
            { title: "Roles", href: "/roles", icon: UserCog },
            { title: "Settings", href: "/settings", icon: Settings },
            { title: "Audit log", href: "/audit", icon: ScrollText },
        ],
    },
    {
        id: "workspace",
        items: [
            { title: "Tasks", href: "/tasks", icon: ListChecks },
            { title: "Schedule", href: "/schedule", icon: CalendarClock },
            { title: "Employees", href: "/employees", icon: Contact },
            { title: "Flow Editor", href: "/flows", icon: Workflow },
        ],
    },
];

export const allNavItems: NavItem[] = navigation.flatMap((section) => section.items);
