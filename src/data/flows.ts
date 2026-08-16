import type { FulfilmentPlan, FulfilmentTemplate, OnboardingFlow } from "@/types";

/* ------------------------------------------------------------------ */
/* Onboarding form flows consumed by the mobile apps. Ported from the */
/* ADX-AdminUI flow editor and reseeded with marketplace content.     */
/* ------------------------------------------------------------------ */

export const onboardingFlows: OnboardingFlow[] = [
    {
        key: "publisher-onboarding",
        label: "Publisher onboarding",
        audience: "Media owners signing up on the ADX app",
        description: "KYC first flow that captures the business, contact and payout details for a new publisher.",
        updated: "2026-08-04",
        screens: [
            {
                key: "welcome",
                title: "Tell us about your business",
                subtitle: "Takes about 3 minutes",
                ctaLabel: "Continue",
                fields: [
                    { id: "f_biz_name", type: "text", label: "Business name", required: true, placeholder: "Sharma Hoardings" },
                    { id: "f_biz_type", type: "selectable_cards", label: "Business type", required: true, options: ["Individual owner", "Registered company", "Advertising agency"], branching: true },
                    { id: "f_phone", type: "phone", label: "Primary mobile", required: true },
                ],
            },
            {
                key: "kyc-documents",
                title: "KYC documents",
                subtitle: "PAN and GST keep payouts compliant",
                ctaLabel: "Continue",
                fields: [
                    { id: "f_pan", type: "text", label: "PAN number", required: true, placeholder: "ABCDE1234F" },
                    { id: "f_gst", type: "text", label: "GSTIN", required: false, helper: "Optional for individual owners" },
                    { id: "f_pan_upload", type: "image_upload", label: "PAN card photo", required: true },
                ],
            },
            {
                key: "payout-details",
                title: "Payout account",
                subtitle: "Where weekly settlements land",
                ctaLabel: "Finish setup",
                fields: [
                    { id: "f_account", type: "text", label: "Account number", required: true },
                    { id: "f_ifsc", type: "text", label: "IFSC", required: true, placeholder: "HDFC0000123" },
                    { id: "f_upi_switch", type: "switch", label: "Also enable UPI payouts", required: false },
                ],
            },
        ],
        branches: [
            {
                key: "registered-company",
                title: "Registered company",
                description: "Extra incorporation details when the publisher picks Registered company.",
                screens: [
                    {
                        key: "company-details",
                        title: "Company details",
                        subtitle: "As per the certificate of incorporation",
                        ctaLabel: "Continue",
                        fields: [
                            { id: "f_cin", type: "text", label: "CIN", required: true },
                            { id: "f_incorp_upload", type: "image_upload", label: "Incorporation certificate", required: true },
                        ],
                    },
                ],
            },
        ],
    },
    {
        key: "advertiser-onboarding",
        label: "Advertiser onboarding",
        audience: "Brands and agencies booking campaigns",
        description: "Lightweight signup that captures brand, billing and campaign intent before the first booking.",
        updated: "2026-07-28",
        screens: [
            {
                key: "brand",
                title: "Your brand",
                subtitle: "Shown to publishers on booking requests",
                ctaLabel: "Continue",
                fields: [
                    { id: "f_brand_name", type: "text", label: "Brand name", required: true },
                    { id: "f_industry", type: "select", label: "Industry", required: true, options: ["FMCG", "Food delivery", "Real estate", "Retail", "Entertainment", "Other"] },
                    { id: "f_agency", type: "checkbox", label: "I am booking on behalf of an agency", required: false },
                ],
            },
            {
                key: "billing",
                title: "Billing details",
                subtitle: "Used on GST invoices",
                ctaLabel: "Continue",
                fields: [
                    { id: "f_bill_gst", type: "text", label: "GSTIN", required: true },
                    { id: "f_bill_address", type: "textarea", label: "Billing address", required: true },
                ],
            },
            {
                key: "intent",
                title: "What are you promoting",
                subtitle: "Helps us suggest the right sites",
                ctaLabel: "Finish",
                fields: [
                    { id: "f_budget", type: "slider", label: "Monthly budget (Rs lakh)", required: false },
                    { id: "f_cities", type: "select", label: "Target cities", required: true, options: ["Mumbai", "Delhi NCR", "Bangalore", "Hyderabad", "Chennai", "Pune"] },
                ],
            },
        ],
        branches: [],
    },
    {
        key: "listing-creation",
        label: "Listing creation",
        audience: "Publishers adding a new ad space",
        description: "Structured capture of a hoarding or screen: location, dimensions, photos and pricing inputs.",
        updated: "2026-08-01",
        screens: [
            {
                key: "site-basics",
                title: "Site basics",
                subtitle: "Step 1 of 3",
                ctaLabel: "Continue",
                fields: [
                    { id: "f_site_title", type: "text", label: "Listing title", required: true, placeholder: "Andheri West Metro Facing Hoarding" },
                    { id: "f_media_type", type: "radio", label: "Media type", required: true, options: ["Static hoarding", "Digital screen", "Transit", "Street furniture"] },
                    { id: "f_site_info", type: "info", label: "Accurate details clear review faster", required: false, helper: "Listings with complete dimensions and photos clear moderation 2x faster." },
                ],
            },
            {
                key: "dimensions",
                title: "Location and dimensions",
                subtitle: "Step 2 of 3",
                ctaLabel: "Continue",
                fields: [
                    { id: "f_address", type: "textarea", label: "Full address", required: true },
                    { id: "f_width", type: "text", label: "Width (ft)", required: true },
                    { id: "f_height", type: "text", label: "Height (ft)", required: true },
                    { id: "f_illumination", type: "select", label: "Illumination", required: true, options: ["Non lit", "Front lit", "Back lit", "Digital"] },
                ],
            },
            {
                key: "photos",
                title: "Site photos",
                subtitle: "Step 3 of 3",
                ctaLabel: "Submit for review",
                fields: [
                    { id: "f_photo_wide", type: "image_upload", label: "Wide angle photo", required: true },
                    { id: "f_photo_close", type: "image_upload", label: "Close up photo", required: true },
                    { id: "f_traffic_header", type: "section_header", label: "Traffic details", required: false },
                    { id: "f_footfall", type: "select", label: "Traffic density", required: false, options: ["Low", "Medium", "High", "Very high"] },
                ],
            },
        ],
        branches: [],
    },
    {
        key: "agent-onboarding",
        label: "Agent onboarding",
        audience: "Field agents joining the fulfilment network",
        description: "Identity, service area and vehicle details for field agents who mount and verify campaigns.",
        updated: "2026-07-19",
        screens: [
            {
                key: "identity",
                title: "Identity check",
                subtitle: "Aadhaar and a selfie",
                ctaLabel: "Continue",
                fields: [
                    { id: "f_aadhaar", type: "text", label: "Aadhaar number", required: true },
                    { id: "f_selfie", type: "image_upload", label: "Selfie", required: true },
                ],
            },
            {
                key: "service-area",
                title: "Service area",
                subtitle: "Where you can take jobs",
                ctaLabel: "Finish",
                fields: [
                    { id: "f_city", type: "select", label: "Base city", required: true, options: ["Mumbai", "Delhi NCR", "Bangalore", "Hyderabad", "Chennai", "Pune", "Kolkata"] },
                    { id: "f_radius", type: "slider", label: "Travel radius (km)", required: false },
                    { id: "f_vehicle", type: "radio", label: "Vehicle", required: true, options: ["Two wheeler", "Four wheeler", "None"] },
                ],
            },
        ],
        branches: [],
    },
];

/* ------------------------------------------------------------------ */
/* Fulfilment templates: the steps field agents complete on an order. */
/* ------------------------------------------------------------------ */

export const fulfilmentTemplates: FulfilmentTemplate[] = [
    {
        id: "FT-01",
        title: "Site Survey",
        description: "Agent visits the site before the campaign goes live and confirms condition and visibility.",
        type: "survey",
        requirements: [
            { kind: "location_checkin" },
            { kind: "photo", label: "Wide angle shot" },
            { kind: "photo", label: "Close up of structure" },
            { kind: "checklist_item", label: "Structure is safe and rust free" },
        ],
        estimatedMins: 25,
        active: true,
        updated: "2026-07-30",
    },
    {
        id: "FT-02",
        title: "Creative Collection",
        description: "Collect the printed flex or creative material from the print vendor.",
        type: "creative_collection",
        requirements: [
            { kind: "photo", label: "Collected material" },
            { kind: "checklist_item", label: "Print matches approved creative" },
            { kind: "contact_details_visible" },
        ],
        estimatedMins: 40,
        active: true,
        updated: "2026-07-30",
    },
    {
        id: "FT-03",
        title: "Installation",
        description: "Mount the creative at the site and document the finished installation.",
        type: "installation",
        requirements: [
            { kind: "location_checkin" },
            { kind: "photo", label: "Installed creative, wide angle" },
            { kind: "photo", label: "Installed creative with landmark" },
            { kind: "checklist_item", label: "No creases or tears" },
            { kind: "qr_scan" },
        ],
        estimatedMins: 90,
        active: true,
        updated: "2026-08-02",
    },
    {
        id: "FT-04",
        title: "Verification",
        description: "Independent proof that the campaign is live: photos, QR scan and checklist.",
        type: "verification",
        requirements: [
            { kind: "location_checkin" },
            { kind: "qr_scan" },
            { kind: "photo", label: "Wide angle proof" },
            { kind: "photo", label: "Close up proof" },
            { kind: "checklist_item", label: "Creative matches booking" },
        ],
        estimatedMins: 20,
        active: true,
        updated: "2026-08-02",
    },
    {
        id: "FT-05",
        title: "Mid Campaign Health Check",
        description: "Recurring check that the creative is intact and illumination works.",
        type: "health_check",
        requirements: [
            { kind: "photo", label: "Current condition" },
            { kind: "checklist_item", label: "Illumination working after dusk" },
            { kind: "checklist_item", label: "No damage or overlap by other media" },
        ],
        estimatedMins: 15,
        active: true,
        updated: "2026-07-22",
    },
    {
        id: "FT-06",
        title: "Takedown Confirmation",
        description: "Confirm removal of the creative at campaign end.",
        type: "custom",
        requirements: [
            { kind: "location_checkin" },
            { kind: "photo", label: "Cleared site" },
        ],
        estimatedMins: 30,
        active: false,
        updated: "2026-06-15",
    },
];

export const fulfilmentPlans: FulfilmentPlan[] = [
    {
        id: "FP-01",
        name: "Standard hoarding campaign",
        description: "Default plan for static hoardings booked with printing and mounting.",
        active: true,
        items: [
            { templateId: "FT-01", order: 1, optional: false },
            { templateId: "FT-02", order: 2, optional: false },
            { templateId: "FT-03", order: 3, optional: false },
            { templateId: "FT-04", order: 4, optional: false },
            { templateId: "FT-05", order: 5, optional: true },
        ],
    },
    {
        id: "FP-02",
        name: "Digital screen campaign",
        description: "No physical mounting: creative goes live remotely, verification still happens on site.",
        active: true,
        items: [
            { templateId: "FT-04", order: 1, optional: false },
            { templateId: "FT-05", order: 2, optional: true },
        ],
    },
    {
        id: "FP-03",
        name: "Self install by publisher",
        description: "Publisher mounts the creative, agent only verifies and monitors.",
        active: true,
        items: [
            { templateId: "FT-02", order: 1, optional: true },
            { templateId: "FT-04", order: 2, optional: false },
            { templateId: "FT-05", order: 3, optional: true },
            { templateId: "FT-06", order: 4, optional: true },
        ],
    },
];
