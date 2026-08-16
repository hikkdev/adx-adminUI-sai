import type {
    CategorySlice,
    DayPoint,
    KpiStat,
    MonthPoint,
    SmartInsight,
    TopPublisherRow,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export const dashboardKpis: KpiStat[] = [
    { id: "gmv", label: "GMV this month", value: "₹18,42,300", delta: "+22.4%", deltaTone: "positive", hint: "from last month" },
    { id: "campaigns", label: "Active campaigns", value: "247", delta: "+18", deltaTone: "positive", hint: "since last week" },
    { id: "publishers", label: "Publishers verified", value: "1,284", delta: "+64", deltaTone: "positive", hint: "this month" },
    { id: "kyc", label: "Pending KYC", value: "23", delta: "6", deltaTone: "neutral", hint: "new today" },
];

export const smartInsight: SmartInsight = {
    id: "ins_1",
    severity: "warning",
    message:
        "Fill rate in Maharashtra dropped 6% this week, 14 Mumbai listings are vacant while advertiser demand grew. Consider a targeted campaign push.",
    action: { label: "View Mumbai inventory", href: "/listings" },
};

/** Monthly GMV bars (₹), Jan through Dec. */
export const monthlyGmv: MonthPoint[] = [
    { month: "Jan", value: 620000 },
    { month: "Feb", value: 840000 },
    { month: "Mar", value: 1750000 },
    { month: "Apr", value: 1580000 },
    { month: "May", value: 1690000 },
    { month: "Jun", value: 980000 },
    { month: "Jul", value: 1420000 },
    { month: "Aug", value: 1610000 },
    { month: "Sep", value: 1180000 },
    { month: "Oct", value: 1760000 },
    { month: "Nov", value: 1930000 },
    { month: "Dec", value: 1480000 },
];

/** Publisher growth curve, cumulative signups by month. */
export const publisherGrowth: MonthPoint[] = [
    { month: "Jan", value: 420 },
    { month: "Feb", value: 486 },
    { month: "Mar", value: 540 },
    { month: "Apr", value: 598 },
    { month: "May", value: 685 },
    { month: "Jun", value: 742 },
    { month: "Jul", value: 806 },
    { month: "Aug", value: 894 },
    { month: "Sep", value: 972 },
    { month: "Oct", value: 1065 },
    { month: "Nov", value: 1178 },
    { month: "Dec", value: 1284 },
];

export const recentBookings = [
    { id: "rb_1", advertiser: "Zomato", campaign: "Diwali brand push", amount: 180000 },
    { id: "rb_2", advertiser: "PhonePe", campaign: "Cashback push", amount: 68500 },
    { id: "rb_3", advertiser: "Nike Run Club", campaign: "FitZone launch", amount: 36000 },
    { id: "rb_4", advertiser: "Cafe Coffee Day", campaign: "Local reach", amount: 40000 },
];

export const bookingsThisMonth = { count: 265, averageValue: 68000 };

/* ------------------------------------------------------------------ */
/* Analytics report                                                    */
/* ------------------------------------------------------------------ */

export const analyticsKpis: KpiStat[] = [
    { id: "gmv30", label: "GMV (30D)", value: "₹18.4L", delta: "▲ 22.4%", deltaTone: "positive" },
    { id: "take", label: "Take rate", value: "12.6%", delta: "▲ 0.8pt", deltaTone: "positive" },
    { id: "listings", label: "Active listings", value: "1,092", delta: "▲ 64", deltaTone: "positive" },
    { id: "fill", label: "Fill rate", value: "71%", delta: "▼ 2.1pt", deltaTone: "negative" },
];

/** Daily GMV for the last 30 days, with the previous period for comparison. */
export const dailyGmv: (DayPoint & { previous: number })[] = [
    { date: "1 Apr", value: 42000, previous: 36000 },
    { date: "2 Apr", value: 44500, previous: 38200 },
    { date: "3 Apr", value: 39800, previous: 41000 },
    { date: "4 Apr", value: 47200, previous: 39600 },
    { date: "5 Apr", value: 52600, previous: 42800 },
    { date: "6 Apr", value: 49800, previous: 44100 },
    { date: "7 Apr", value: 45400, previous: 40800 },
    { date: "8 Apr", value: 48900, previous: 42200 },
    { date: "9 Apr", value: 51200, previous: 43600 },
    { date: "10 Apr", value: 46800, previous: 45000 },
    { date: "11 Apr", value: 53400, previous: 44400 },
    { date: "12 Apr", value: 57800, previous: 46800 },
    { date: "13 Apr", value: 54100, previous: 48000 },
    { date: "14 Apr", value: 49600, previous: 45400 },
    { date: "15 Apr", value: 52300, previous: 46200 },
    { date: "16 Apr", value: 55700, previous: 47800 },
    { date: "17 Apr", value: 58200, previous: 49000 },
    { date: "18 Apr", value: 61400, previous: 50400 },
    { date: "19 Apr", value: 56900, previous: 51800 },
    { date: "20 Apr", value: 53800, previous: 48600 },
    { date: "21 Apr", value: 57200, previous: 49800 },
    { date: "22 Apr", value: 55200, previous: 51100 },
    { date: "23 Apr", value: 59600, previous: 52400 },
    { date: "24 Apr", value: 63800, previous: 53600 },
    { date: "25 Apr", value: 60200, previous: 54800 },
    { date: "26 Apr", value: 57400, previous: 52000 },
    { date: "27 Apr", value: 61800, previous: 53400 },
    { date: "28 Apr", value: 65200, previous: 54600 },
    { date: "29 Apr", value: 68400, previous: 55800 },
    { date: "30 Apr", value: 71600, previous: 57200 },
];

export const gmvByCategory: CategorySlice[] = [
    { category: "Outdoor", value: 820000 },
    { category: "Transit", value: 460000 },
    { category: "Indoor", value: 340000 },
    { category: "Media", value: 220000 },
];

export const topPublishers: TopPublisherRow[] = [
    { publisher: "Phoenix Mall Group", city: "Mumbai", gmv: 240000, share: 18 },
    { publisher: "Sharma Hoardings", city: "Delhi", gmv: 190000, share: 12 },
    { publisher: "FitZone Studios", city: "Bengaluru", gmv: 160000, share: -4 },
    { publisher: "Metro Walls Co", city: "Hyderabad", gmv: 120000, share: 9 },
    { publisher: "Whitefield Lot", city: "Bengaluru", gmv: 90000, share: -2 },
];
