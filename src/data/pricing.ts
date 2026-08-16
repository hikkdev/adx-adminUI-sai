import type {
    CategoryRuleRow,
    FactorRow,
    KpiStat,
    NamedStatRow,
    PriceApproval,
    RateCard,
    RateCardSettings,
    RateMatrixRow,
    RuleCondition,
    SizeBand,
    SurgeWindow,
    WeekRealisation,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export const pricingKpis: KpiStat[] = [
    { id: "cards", label: "Active rate cards", value: "4", hint: "2 scheduled" },
    { id: "rules", label: "Rules live", value: "27", delta: "▲ 3 new", deltaTone: "positive" },
    { id: "realised", label: "Avg realised rate / wk", value: "₹94,200", delta: "▼ 2.1%", deltaTone: "negative" },
    { id: "leakage", label: "Discount leakage", value: "8.4%", delta: "▲ 1.2 pts", deltaTone: "negative" },
    { id: "awaiting", label: "Awaiting approval", value: "6", delta: "2 overdue", deltaTone: "negative" },
];

export const rateRealisation: WeekRealisation[] = [
    { week: "W18", cardRate: 104000, realisedRate: 96500 },
    { week: "W19", cardRate: 106000, realisedRate: 97200 },
    { week: "W20", cardRate: 110000, realisedRate: 99800 },
    { week: "W21", cardRate: 107000, realisedRate: 96900 },
    { week: "W22", cardRate: 109000, realisedRate: 95400 },
    { week: "W23", cardRate: 112000, realisedRate: 98100 },
    { week: "W24", cardRate: 110500, realisedRate: 97600 },
    { week: "W25", cardRate: 115000, realisedRate: 94200 },
];

export const discountDrivers: NamedStatRow[] = [
    { name: "Agency volume commitment", detail: "Applied on 42 deals", value: "3.2%" },
    { name: "Long-term lock-in 12 wk+", detail: "Applied on 28 deals", value: "2.1%" },
    { name: "Festive bundle override", detail: "Applied on 17 deals", value: "1.8%" },
    { name: "Last-minute fill discount", detail: "Applied on 31 deals", value: "1.3%" },
];

export const categoriesAboveCard: NamedStatRow[] = [
    { name: "Airport T2 Domestic", detail: "18 sites priced", value: "+12.4%", tone: "positive" },
    { name: "Mall panels South", detail: "64 sites priced", value: "+7.8%", tone: "positive" },
    { name: "Metro pillars Bengaluru", detail: "96 sites priced", value: "+5.1%", tone: "positive" },
    { name: "Transit shelters Mumbai", detail: "210 sites priced", value: "+2.3%", tone: "positive" },
];

export const rulesFiringMost: NamedStatRow[] = [
    { name: "Volume slab ≥ 8 weeks", detail: "Discount rule", value: "1,284" },
    { name: "Festive surge Q3", detail: "Uplift rule", value: "912" },
    { name: "New advertiser welcome", detail: "Discount rule", value: "604" },
    { name: "Last-7-day fill", detail: "Uplift rule", value: "388" },
];

/* ------------------------------------------------------------------ */
/* Rate cards                                                          */
/* ------------------------------------------------------------------ */

export const rateCards: RateCard[] = [
    { id: "rc_blr_metro", name: "Bengaluru Metro Premium", mediaType: "Static + digital", version: 4, coverage: "Bengaluru · 412 sites", effectiveFrom: "1 Mar 2026", effectiveTo: "30 Jun 2026", sitesPriced: 412, status: "active" },
    { id: "rc_mum_core", name: "Mumbai Core Corridors", mediaType: "Static + transit", version: 6, coverage: "Mumbai · 268 sites", effectiveFrom: "1 Feb 2026", effectiveTo: "31 May 2026", sitesPriced: 268, status: "active" },
    { id: "rc_del_ncr", name: "Delhi NCR Arterials", mediaType: "Static", version: 3, coverage: "Delhi NCR · 173 sites", effectiveFrom: "15 Mar 2026", effectiveTo: "14 Jul 2026", sitesPriced: 173, status: "active" },
    { id: "rc_mall_national", name: "Mall Media National", mediaType: "Mall panels", version: 2, coverage: "6 cities · 118 sites", effectiveFrom: "1 Apr 2026", effectiveTo: "30 Sep 2026", sitesPriced: 118, status: "active" },
    { id: "rc_festive", name: "Festive Season Uplift", mediaType: "All media", version: 1, coverage: "All metros", effectiveFrom: "1 Oct 2026", effectiveTo: "31 Dec 2026", sitesPriced: 0, status: "scheduled" },
    { id: "rc_airport", name: "Airport Premium FY27", mediaType: "Airport panels", version: 1, coverage: "BLR + BOM airports", effectiveFrom: "1 May 2026", effectiveTo: "30 Apr 2027", sitesPriced: 0, status: "scheduled" },
    { id: "rc_tier2", name: "Tier-2 Expansion Draft", mediaType: "Static", version: 1, coverage: "Pune · Kochi · Indore", effectiveFrom: "-", effectiveTo: "-", sitesPriced: 0, status: "draft" },
];

/** Builder matrix for "Bengaluru Metro Premium", weekly base rates. */
export const rateMatrix: RateMatrixRow[] = [
    { mediaType: "Static hoarding", premium: 240000, gradeA: 180000, gradeB: 125000, gradeC: 86000 },
    { mediaType: "Digital billboard", premium: 420000, gradeA: 310000, gradeB: 205000, gradeC: null },
    { mediaType: "Transit shelter", premium: 64000, gradeA: 48000, gradeB: 36000, gradeC: 24000 },
    { mediaType: "Mall panel", premium: 110000, gradeA: 82000, gradeB: 58000, gradeC: null },
    { mediaType: "Airport panel", premium: 560000, gradeA: 390000, gradeB: null, gradeC: null },
    { mediaType: "Auto / cab wrap", premium: null, gradeA: 22000, gradeB: 16000, gradeC: 11000 },
];

export const rateCardSettings: RateCardSettings[] = [
    { label: "Base unit", helper: "Rates are quoted per week", value: "Per week" },
    { label: "Minimum booking", helper: "Shortest sellable duration", value: "1 week" },
    { label: "Currency", helper: "All rates and invoices", value: "INR" },
    { label: "Rounding", helper: "Applied after multipliers", value: "Nearest ₹100" },
    { label: "Floor price protection", helper: "Blocks quotes below the floor", value: "On", toggle: true },
    { label: "Tax treatment", helper: "GST added at invoicing", value: "Exclusive" },
    { label: "Production charges", helper: "Printing and mounting", value: "Billed separately" },
];

/* ------------------------------------------------------------------ */
/* Dimensions & size bands                                             */
/* ------------------------------------------------------------------ */

export const sizeBands: SizeBand[] = [
    { band: "Compact", dimensions: "Up to 12 × 6 ft", areaRange: "≤ 72 sq ft", rateBasis: "Flat", multiplier: "0.80×" },
    { band: "Standard", dimensions: "12 × 6 to 20 × 10 ft", areaRange: "72-200 sq ft", rateBasis: "Per sq ft", multiplier: "1.00×" },
    { band: "Large", dimensions: "20 × 10 to 30 × 15 ft", areaRange: "200-450 sq ft", rateBasis: "Per sq ft", multiplier: "1.15×" },
    { band: "Super", dimensions: "30 × 15 to 40 × 20 ft", areaRange: "450-800 sq ft", rateBasis: "Per sq ft", multiplier: "1.30×" },
    { band: "Landmark", dimensions: "Above 40 × 20 ft", areaRange: "> 800 sq ft", rateBasis: "Negotiated", multiplier: "1.50×" },
];

export const sqftSlabs: FactorRow[] = [
    { factor: "First 100 sq ft", multiplier: "₹210 / sq ft" },
    { factor: "101 to 300 sq ft", multiplier: "₹185 / sq ft" },
    { factor: "301 to 600 sq ft", multiplier: "₹160 / sq ft" },
    { factor: "Above 600 sq ft", multiplier: "₹140 / sq ft" },
];

export const illuminationMultipliers: FactorRow[] = [
    { factor: "Non-lit", multiplier: "0.85×" },
    { factor: "Front-lit", multiplier: "1.00×" },
    { factor: "Back-lit", multiplier: "1.15×" },
    { factor: "Digital / LED", multiplier: "1.60×" },
];

export const aspectFactors: { label: string; rows: FactorRow[] }[] = [
    {
        label: "Facing",
        rows: [
            { factor: "Towards oncoming traffic", multiplier: "1.10×" },
            { factor: "Parallel to road", multiplier: "0.95×" },
            { factor: "Junction / multi-face", multiplier: "1.20×" },
        ],
    },
    {
        label: "Elevation",
        rows: [
            { factor: "Eye level (≤ 20 ft)", multiplier: "1.05×" },
            { factor: "Mid rise (20-40 ft)", multiplier: "1.00×" },
            { factor: "High rise (> 40 ft)", multiplier: "0.90×" },
        ],
    },
    {
        label: "Visibility",
        rows: [
            { factor: "Clear 100 m+ approach", multiplier: "1.10×" },
            { factor: "Partial obstruction", multiplier: "0.90×" },
            { factor: "Signal wait zone", multiplier: "1.15×" },
            { factor: "Flyover shadow", multiplier: "0.85×" },
        ],
    },
];

export const workedExample = {
    descriptor: "40 × 20 ft back-lit hoarding, junction facing, Bengaluru Grade A",
    steps: [
        ["Base (800 sq ft slab mix)", "₹1,46,000"],
        ["Size band · Super 1.30×", "₹1,89,800"],
        ["Illumination · Back-lit 1.15×", "₹2,18,270"],
        ["Facing · Junction 1.20×", "₹2,61,924"],
        ["Visibility · Signal wait 1.15×", "₹3,01,213"],
        ["Rounding · nearest ₹100", "₹3,01,200"],
    ] as [string, string][],
    total: "₹3,01,200 / week",
};

/* ------------------------------------------------------------------ */
/* Category rules                                                      */
/* ------------------------------------------------------------------ */

export const categoryRules: CategoryRuleRow[] = [
    { category: "FMCG", static: 1.0, digital: 1.0, transit: 1.0, mall: 1.0 },
    { category: "E-commerce", static: 1.0, digital: 0.95, transit: 1.0, mall: 1.05 },
    { category: "BFSI", static: 1.1, digital: 1.1, transit: 1.05, mall: 1.1 },
    { category: "Automotive", static: 1.05, digital: 1.0, transit: 1.0, mall: 1.1 },
    { category: "Real estate", static: 1.15, digital: 1.1, transit: 1.05, mall: 1.0 },
    { category: "Telecom", static: 1.0, digital: 0.95, transit: 0.95, mall: 1.0 },
    { category: "Liquor & tobacco", static: "legal", digital: "legal", transit: "blocked", mall: "legal" },
    { category: "Gaming & betting", static: "blocked", digital: "legal", transit: "blocked", mall: "blocked" },
    { category: "Political", static: "legal", digital: "legal", transit: "legal", mall: "blocked" },
    { category: "Government & PSU", static: 0.9, digital: 0.9, transit: 0.9, mall: 0.95 },
    { category: "Education", static: 0.95, digital: 0.95, transit: 0.95, mall: 1.0 },
    { category: "Healthcare", static: 1.0, digital: 1.0, transit: 1.0, mall: 1.0 },
];

export const categoryControls = {
    category: "Liquor & tobacco",
    note: "Legal sign-off is mandatory before any liquor or tobacco creative goes live.",
    fields: [
        ["Surcharge", "+25% on card rate"],
        ["Max share of a site's calendar", "20%"],
        ["Creative pre-clearance", "Required"],
        ["Proximity rule", "Not within 100 m of schools"],
    ] as [string, string][],
    permittedCities: ["Bengaluru", "Mumbai", "Pune", "Hyderabad"],
    approvalChain: ["Category desk review", "Legal sign-off", "City ops confirmation"],
};

/* ------------------------------------------------------------------ */
/* Seasonality & surge                                                 */
/* ------------------------------------------------------------------ */

export const surgeWeeks = [
    ["WK 1", "6 Oct"], ["WK 2", "13 Oct"], ["WK 3", "20 Oct"], ["WK 4", "27 Oct"],
    ["WK 5", "3 Nov"], ["WK 6", "10 Nov"], ["WK 7", "17 Nov"], ["WK 8", "24 Nov"],
    ["WK 9", "1 Dec"], ["WK 10", "8 Dec"], ["WK 11", "15 Dec"], ["WK 12", "22 Dec"],
] as [string, string][];

export const surgeWindows: SurgeWindow[] = [
    { id: "sw_diwali", programme: "Festive Diwali", cities: "All metro cities", label: "Diwali", multiplier: "1.45×", kind: "uplift", fromWeek: 3, toWeek: 5 },
    { id: "sw_durga", programme: "Festive Durga Puja", cities: "Kolkata and Guwahati", label: "Durga Puja", multiplier: "1.35×", kind: "uplift", fromWeek: 2, toWeek: 4 },
    { id: "sw_ipl", programme: "IPL season", cities: "Eight host cities", label: "IPL season", multiplier: "1.30×", kind: "uplift", fromWeek: 5, toWeek: 10 },
    { id: "sw_newyear", programme: "New Year", cities: "All metro cities", label: "New Year", multiplier: "1.25×", kind: "uplift", fromWeek: 9, toWeek: 12 },
    { id: "sw_election", programme: "Election period", cities: "Tier 1 and tier 2 cities", label: "Election", multiplier: "Blocked", kind: "blocked", fromWeek: 6, toWeek: 8 },
    { id: "sw_monsoon", programme: "Monsoon softening", cities: "Coastal cities", label: "Monsoon", multiplier: "0.85×", kind: "soft", fromWeek: 1, toWeek: 2 },
    { id: "sw_republic", programme: "Republic Day", cities: "Delhi NCR", label: "Republic Day", multiplier: "1.20×", kind: "uplift", fromWeek: 4, toWeek: 6 },
];

export const surgeDetail = {
    title: "Diwali Festive",
    kind: "Uplift",
    fields: [
        ["Dates", "20 Oct to 9 Nov"],
        ["Multiplier", "1.45×"],
        ["Minimum booking", "2 weeks"],
    ] as [string, string][],
    appliesTo: ["Static", "Digital", "Mall"],
    sitesInWindow: 1840,
    bookingsHeld: 312,
};

/* ------------------------------------------------------------------ */
/* Approval queue                                                      */
/* ------------------------------------------------------------------ */

export const priceApprovals: PriceApproval[] = [
    {
        id: "RC-4482",
        advertiser: "Zeta Foods",
        requestedDiscount: "18%",
        marginImpact: "−₹42,000",
        age: "2d",
        status: "overdue",
        facts: [
            ["Deal value", "₹6,80,000"],
            ["Sites", "9 static · Bengaluru"],
            ["Flight", "1 May to 28 Jun 2026"],
            ["Requested by", "Anjali Deshpande (agent)"],
        ],
        metrics: [
            ["Card rate", "₹8,30,000"],
            ["Floor (82%)", "₹6,80,600"],
            ["Requested", "₹6,80,000"],
            ["Margin after discount", "9.8%"],
            ["Advertiser LTV", "₹28,40,000"],
        ],
        ruleTrace: [
            { rule: "Base card rate", effect: "-", running: "₹8,30,000" },
            { rule: "Volume slab ≥ 8 weeks", effect: "−6%", running: "₹7,80,200" },
            { rule: "Agency volume commitment", effect: "−4%", running: "₹7,49,000" },
            { rule: "Festive surge Q3", effect: "+5%", running: "₹7,86,450" },
            { rule: "Requested override", effect: "−13.5%", running: "₹6,80,000" },
        ],
        checks: [
            { name: "Below floor price", detail: "₹600 under the 82% floor, needs Finance", ok: false },
            { name: "Margin above 8% guardrail", detail: "9.8% post-discount", ok: true },
            { name: "No open disputes", detail: "Advertiser has a clean 12-month record", ok: true },
            { name: "Credit exposure", detail: "₹4.2L outstanding, within limit", ok: true },
        ],
        similarDeals: [
            { advertiser: "Swiggy", discount: "15%", closed: "12 Apr 2026", margin: "11.2%" },
            { advertiser: "Zepto", discount: "17%", closed: "28 Mar 2026", margin: "10.1%" },
            { advertiser: "Cafe Coffee Day", discount: "12%", closed: "14 Mar 2026", margin: "12.8%" },
        ],
    },
    {
        id: "RC-4479",
        advertiser: "Sunrise Telecom",
        requestedDiscount: "12%",
        marginImpact: "−₹28,500",
        age: "1d",
        status: "overdue",
        facts: [
            ["Deal value", "₹9,40,000"],
            ["Sites", "14 transit · Mumbai"],
            ["Flight", "10 May to 5 Jul 2026"],
            ["Requested by", "Direct sales"],
        ],
        metrics: [
            ["Card rate", "₹10,70,000"],
            ["Floor (82%)", "₹8,77,400"],
            ["Requested", "₹9,40,000"],
            ["Margin after discount", "11.4%"],
            ["Advertiser LTV", "₹12,10,000"],
        ],
        ruleTrace: [
            { rule: "Base card rate", effect: "-", running: "₹10,70,000" },
            { rule: "Long-term lock-in 12 wk+", effect: "−5%", running: "₹10,16,500" },
            { rule: "Requested override", effect: "−7.5%", running: "₹9,40,000" },
        ],
        checks: [
            { name: "Below floor price", detail: "Above floor, routine approval", ok: true },
            { name: "Margin above 8% guardrail", detail: "11.4% post-discount", ok: true },
            { name: "No open disputes", detail: "One resolved dispute in Feb", ok: true },
            { name: "Credit exposure", detail: "First booking, advance payment set", ok: true },
        ],
        similarDeals: [
            { advertiser: "PhonePe", discount: "10%", closed: "2 Apr 2026", margin: "12.4%" },
            { advertiser: "Cred", discount: "14%", closed: "19 Mar 2026", margin: "10.6%" },
        ],
    },
    {
        id: "RC-4471",
        advertiser: "Kanaka Motors",
        requestedDiscount: "22%",
        marginImpact: "−₹61,200",
        age: "18h",
        status: "pending",
        facts: [
            ["Deal value", "₹8,10,000"],
            ["Sites", "6 hoardings · Hyderabad"],
            ["Flight", "15 May to 15 Aug 2026"],
            ["Requested by", "Vikram Reddy (agent)"],
        ],
        metrics: [
            ["Card rate", "₹10,40,000"],
            ["Floor (82%)", "₹8,52,800"],
            ["Requested", "₹8,10,000"],
            ["Margin after discount", "7.1%"],
            ["Advertiser LTV", "₹8,10,000"],
        ],
        ruleTrace: [
            { rule: "Base card rate", effect: "-", running: "₹10,40,000" },
            { rule: "Volume slab ≥ 8 weeks", effect: "−6%", running: "₹9,77,600" },
            { rule: "Requested override", effect: "−17%", running: "₹8,10,000" },
        ],
        checks: [
            { name: "Below floor price", detail: "₹42,800 under floor, Finance required", ok: false },
            { name: "Margin above 8% guardrail", detail: "7.1% breaches the guardrail", ok: false },
            { name: "No open disputes", detail: "New advertiser", ok: true },
            { name: "Credit exposure", detail: "Advance payment agreed", ok: true },
        ],
        similarDeals: [
            { advertiser: "Ola", discount: "16%", closed: "8 Mar 2026", margin: "9.4%" },
        ],
    },
    {
        id: "RC-4466",
        advertiser: "Nilkanth Retail",
        requestedDiscount: "9%",
        marginImpact: "−₹14,800",
        age: "6h",
        status: "pending",
        facts: [
            ["Deal value", "₹4,20,000"],
            ["Sites", "8 mall panels · Pune"],
            ["Flight", "1 Jun to 30 Jun 2026"],
            ["Requested by", "Sneha Patil (agent)"],
        ],
        metrics: [
            ["Card rate", "₹4,62,000"],
            ["Floor (82%)", "₹3,78,800"],
            ["Requested", "₹4,20,000"],
            ["Margin after discount", "12.2%"],
            ["Advertiser LTV", "₹6,60,000"],
        ],
        ruleTrace: [
            { rule: "Base card rate", effect: "-", running: "₹4,62,000" },
            { rule: "New advertiser welcome", effect: "−5%", running: "₹4,38,900" },
            { rule: "Requested override", effect: "−4.3%", running: "₹4,20,000" },
        ],
        checks: [
            { name: "Below floor price", detail: "Comfortably above floor", ok: true },
            { name: "Margin above 8% guardrail", detail: "12.2% post-discount", ok: true },
            { name: "No open disputes", detail: "Clean record", ok: true },
            { name: "Credit exposure", detail: "Within limit", ok: true },
        ],
        similarDeals: [
            { advertiser: "Nike Run Club", discount: "8%", closed: "22 Feb 2026", margin: "13.1%" },
        ],
    },
];

/* ------------------------------------------------------------------ */
/* Revenue share                                                       */
/* ------------------------------------------------------------------ */

export const commissionTiers = [
    { tier: "Bronze", gmv: "Up to ₹2L / qtr", commission: "15%", effective: "15.0%" },
    { tier: "Silver", gmv: "₹2L to ₹8L / qtr", commission: "13%", effective: "13.4%" },
    { tier: "Gold", gmv: "₹8L to ₹25L / qtr", commission: "12%", effective: "12.2%" },
    { tier: "Platinum", gmv: "Above ₹25L / qtr", commission: "10%", effective: "10.6%" },
];

export const revenueCategoryOverrides = [
    { category: "Government and civic", reason: "Tender-bound margins", commission: "8%" },
    { category: "Real estate", reason: "High dispute rate buffer", commission: "14%" },
    { category: "Political", reason: "Prepaid, short flights", commission: "16%" },
    { category: "ADX owned inventory", reason: "House inventory", commission: "100%" },
];

export const agencyFlow: [string, string][] = [
    ["Gross booking", "₹10,00,000"],
    ["Agency commission (15%)", "−₹1,50,000"],
    ["Net media value", "₹8,50,000"],
    ["Platform commission (12%)", "−₹1,02,000"],
    ["To publisher", "₹7,48,000"],
];

export const revenueSplit: [string, string][] = [
    ["Publisher net", "₹7,33,040"],
    ["Platform 12%", "₹1,02,000"],
    ["Agency 15%", "₹1,50,000"],
    ["GST 18%", "collected & remitted"],
    ["TDS 2%", "₹14,960"],
];

export const slaPenalties = [
    { penalty: "Install late by 24-48h", amount: "2% of booking" },
    { penalty: "Install late by 48h+", amount: "5% of booking" },
    { penalty: "Downtime above SLA", amount: "Pro-rata + 1%" },
];

/* ------------------------------------------------------------------ */
/* Simulator                                                           */
/* ------------------------------------------------------------------ */

export const simulatorDefaults = {
    site: "MG Road Billboard · Bengaluru",
    advertiser: "Zomato",
    category: "E-commerce",
    flightStart: "1 May 2026",
    flightEnd: "28 May 2026",
    duration: "4 weeks",
    mediaType: "Static hoarding",
    width: "40 ft",
    height: "20 ft",
    illumination: "Back-lit",
    cityTier: "Metro",
    localityGrade: "Grade A",
    discount: "10%",
};

export const simulatorSteps: { step: string; rule: string; factor: string; running: string }[] = [
    { step: "Base rate", rule: "Bengaluru Metro Premium v4", factor: "₹1,80,000 / wk", running: "₹1,80,000" },
    { step: "Size band", rule: "Super · 450-800 sq ft", factor: "1.30×", running: "₹2,34,000" },
    { step: "Illumination", rule: "Back-lit", factor: "1.15×", running: "₹2,69,100" },
    { step: "Locality grade", rule: "Grade A corridor", factor: "1.00×", running: "₹2,69,100" },
    { step: "Category", rule: "E-commerce on static", factor: "1.00×", running: "₹2,69,100" },
    { step: "Seasonality", rule: "No active window", factor: "1.00×", running: "₹2,69,100" },
    { step: "Duration", rule: "4-week lock-in", factor: "−4%", running: "₹2,58,336" },
    { step: "Subtotal (4 weeks)", rule: "Weekly × 4", factor: "", running: "₹10,33,344" },
    { step: "Negotiated discount", rule: "Approved override", factor: "−10%", running: "₹9,30,010" },
    { step: "Production and mounting", rule: "800 sq ft × ₹32", factor: "+₹25,600", running: "₹9,55,610" },
    { step: "Taxable value", rule: "", factor: "", running: "₹9,55,610" },
    { step: "GST 18%", rule: "On taxable value", factor: "+₹1,72,010", running: "₹11,27,620" },
    { step: "Gross payable", rule: "Advertiser invoice", factor: "", running: "₹11,27,620" },
    { step: "Platform commission 12%", rule: "On taxable value", factor: "−₹1,14,673", running: "₹8,40,937" },
    { step: "TDS 2%", rule: "On publisher share", factor: "−₹16,819", running: "₹8,24,118" },
    { step: "Net to publisher", rule: "Settled T+3 after flight start", factor: "", running: "₹8,24,118" },
];

/* ------------------------------------------------------------------ */
/* Rule builder                                                        */
/* ------------------------------------------------------------------ */

export const sampleRule = {
    name: "Q4 e-commerce digital discount",
    priority: 4,
    status: "Draft",
    matchMode: "all" as const,
    conditions: [
        { id: "c1", field: "Media type", operator: "is", value: "Digital billboard" },
        { id: "c2", field: "City tier", operator: "is", value: "Metro" },
        { id: "c3", field: "Advertiser category", operator: "is", value: "E-commerce" },
        { id: "c4", field: "Booking duration", operator: "is greater than or equal to", value: "4 weeks" },
    ] as RuleCondition[],
    adjustment: { kind: "Multiplier", value: "0.88×", appliesTo: "Base rate" },
    schedule: { from: "1 Oct 2026", to: "31 Dec 2026" },
    preview: [
        ["Sample site", "Indiranagar LED · Grade A"],
        ["Card rate (4 wk)", "₹12,40,000"],
        ["After this rule", "₹10,91,200"],
        ["Margin", "10.4%"],
    ] as [string, string][],
    conflicts: [
        { name: "Festive surge Q3", note: "Uplift 1.45× overlaps 20 Oct to 9 Nov", meta: "Priority 2, fires first" },
        { name: "Volume slab ≥ 8 weeks", note: "Both discount base rate", meta: "Stacking capped at −15%" },
    ],
};
