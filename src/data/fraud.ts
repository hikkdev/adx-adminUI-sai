import type { FraudCase } from "@/types";

export const fraudCases: FraudCase[] = [
    {
        id: "FR-1184",
        title: "Four advertisers sharing one payout account",
        score: 0.91,
        status: "suspended",
        summary: "4 accounts share a PAN, a device fingerprint and a payout account.",
        openedAgo: "1h ago",
        accountCount: 4,
        valueAtRisk: 1840000,
        nodes: [
            { id: "fa", label: "FA", sub: "FakeAds Ltd", kind: "flagged", x: 22, y: 20 },
            { id: "nr", label: "NR", sub: "Nova Reach", kind: "flagged", x: 20, y: 62 },
            { id: "pa", label: "PA", sub: "Prime Ads", kind: "flagged", x: 40, y: 84 },
            { id: "sc", label: "SC", sub: "Skyline Co", kind: "flagged", x: 44, y: 12 },
            { id: "dev", label: "▢", sub: "Device 4f2a · 6 sessions", kind: "shared", x: 38, y: 42 },
            { id: "pan", label: "ID", sub: "PAN ••••1234 · shared by 4", kind: "shared", x: 58, y: 30 },
            { id: "bank", label: "₹", sub: "HDFC ••4821 · shared by 4", kind: "shared", x: 58, y: 62 },
            { id: "zp", label: "ZP", sub: "Zepto · no link", kind: "clean", x: 84, y: 22 },
            { id: "bl", label: "BL", sub: "Blinkit · no link", kind: "clean", x: 86, y: 70 },
        ],
        edges: [
            ["fa", "dev"], ["nr", "dev"], ["pa", "dev"], ["sc", "dev"],
            ["fa", "pan"], ["sc", "pan"], ["nr", "bank"], ["pa", "bank"],
            ["pan", "bank"],
        ],
        sharedSignals: [
            ["PAN number", "4 accounts"],
            ["Device fingerprint", "4 accounts"],
            ["Payout account", "4 accounts"],
            ["IP subnet", "3 accounts"],
        ],
        timeline: [
            { label: "Auto-suspended by fraud engine", ago: "1h ago" },
            { label: "4th account created on same device", ago: "2h ago" },
            { label: "Payout account reused", ago: "1d ago" },
            { label: "First account created", ago: "12d ago" },
        ],
    },
    {
        id: "FR-1179",
        title: "Publisher listing the same hoarding twice",
        score: 0.84,
        status: "open",
        summary: "2 publisher accounts list the same site with different photos.",
        openedAgo: "6h ago",
        accountCount: 2,
        valueAtRisk: 620000,
        nodes: [
            { id: "p1", label: "SH", sub: "Sunrise Hoardings", kind: "flagged", x: 24, y: 30 },
            { id: "p2", label: "SM", sub: "Sunrise Media", kind: "flagged", x: 24, y: 70 },
            { id: "site", label: "◎", sub: "GPS 12.9716, 77.5946", kind: "shared", x: 52, y: 50 },
            { id: "gst", label: "ID", sub: "GST ••••8891 · shared by 2", kind: "shared", x: 74, y: 30 },
            { id: "ok", label: "MW", sub: "Metro Walls · no link", kind: "clean", x: 82, y: 74 },
        ],
        edges: [
            ["p1", "site"], ["p2", "site"], ["p1", "gst"], ["p2", "gst"],
        ],
        sharedSignals: [
            ["Site coordinates", "2 accounts"],
            ["GST number", "2 accounts"],
            ["Bank IFSC", "2 accounts"],
        ],
        timeline: [
            { label: "Duplicate coordinates detected", ago: "6h ago" },
            { label: "Second listing published", ago: "3d ago" },
            { label: "Second account verified", ago: "9d ago" },
        ],
    },
    {
        id: "FR-1173",
        title: "Agent self-approving their own onboardings",
        score: 0.77,
        status: "escalated",
        summary: "One agent onboarded 3 publishers that all pay out to a related account.",
        openedAgo: "2d ago",
        accountCount: 4,
        valueAtRisk: 410000,
        nodes: [
            { id: "ag", label: "RK", sub: "Agent · Rohit K", kind: "flagged", x: 22, y: 50 },
            { id: "p1", label: "A1", sub: "Anand Prints", kind: "flagged", x: 50, y: 20 },
            { id: "p2", label: "A2", sub: "Anand Media", kind: "flagged", x: 50, y: 50 },
            { id: "p3", label: "A3", sub: "Anand Outdoor", kind: "flagged", x: 50, y: 80 },
            { id: "upi", label: "₹", sub: "UPI anand@okaxis · shared by 3", kind: "shared", x: 78, y: 50 },
        ],
        edges: [
            ["ag", "p1"], ["ag", "p2"], ["ag", "p3"],
            ["p1", "upi"], ["p2", "upi"], ["p3", "upi"],
        ],
        sharedSignals: [
            ["UPI handle", "3 accounts"],
            ["Onboarding agent", "3 accounts"],
            ["Surname match", "3 accounts"],
        ],
        timeline: [
            { label: "Escalated to legal", ago: "2d ago" },
            { label: "Third publisher onboarded", ago: "5d ago" },
            { label: "Pattern flagged by review", ago: "8d ago" },
        ],
    },
    {
        id: "FR-1166",
        title: "Card testing on campaign deposits",
        score: 0.62,
        status: "dismissed",
        summary: "Repeated small deposits from one IP, later confirmed as a finance team test.",
        openedAgo: "9d ago",
        accountCount: 1,
        valueAtRisk: 0,
        nodes: [
            { id: "ad", label: "TT", sub: "Test Tenant", kind: "flagged", x: 30, y: 45 },
            { id: "ip", label: "IP", sub: "10.4.12.8 · 22 attempts", kind: "shared", x: 62, y: 45 },
            { id: "ok", label: "FN", sub: "Finance sandbox · expected", kind: "clean", x: 84, y: 62 },
        ],
        edges: [["ad", "ip"], ["ip", "ok"]],
        sharedSignals: [
            ["IP subnet", "1 account"],
            ["Card BIN", "1 account"],
        ],
        timeline: [
            { label: "Dismissed as internal testing", ago: "9d ago" },
            { label: "22 deposit attempts in 4 minutes", ago: "10d ago" },
        ],
    },
];

export const getFraudCase = (id: string) => fraudCases.find((item) => item.id === id);
