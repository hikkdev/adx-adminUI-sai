import type { MergeVariable, NotificationTemplate } from "@/types";

/**
 * Merge variables available to every template. `sample` drives the live
 * preview so authors see a rendered message, not raw tokens.
 */
export const mergeVariables: MergeVariable[] = [
    { token: "{{publisher_name}}", helper: "Registered business name of the recipient", sample: "Sharma Hoardings" },
    { token: "{{agent_name}}", helper: "Field agent assigned to the order", sample: "Ravi Kumar" },
    { token: "{{order_id}}", helper: "ADX order reference", sample: "ORD-20482" },
    { token: "{{amount}}", helper: "Net payout in rupees, after commission and TDS", sample: "₹1,24,500" },
    { token: "{{due_date}}", helper: "Date the payout is released to the bank", sample: "28 Jun 2026" },
    { token: "{{bank_last4}}", helper: "Last four digits of the settlement account", sample: "4412" },
    { token: "{{site_name}}", helper: "Listing the order is against", sample: "MG Road Billboard" },
    { token: "{{dispute_id}}", helper: "Dispute case reference", sample: "DSP-1184" },
    { token: "{{reason}}", helper: "Free-text reason supplied by the reviewer", sample: "Address proof was illegible" },
    { token: "{{cta_url}}", helper: "Deep link into the ADX app", sample: "adx.in/app/payouts" },
];

export const notificationTemplates: NotificationTemplate[] = [
    {
        id: "tpl_payout_due",
        name: "Payout due reminder",
        trigger: "Sent when a payout is scheduled for release in the next 48 hours",
        category: "Payouts",
        status: "live",
        updatedAt: "2026-08-04",
        updatedBy: "Priya Rao",
        sent30d: 4218,
        deliveryRate: 99.1,
        sending: {
            event: "payout.scheduled",
            audience: "publishers",
            conditions: [
                { id: "tpl_payout_due-c1", field: "Amount", operator: "is greater than", value: "₹5,000" },
            ],
            delay: "immediate",
            respectQuietHours: true,
            weeklyCap: 2,
        },
        content: {
            email: {
                subject: "Payout for {{order_id}} is on its way",
                body: "Hello {{publisher_name}},\n\nYour payout of {{amount}} for {{order_id}} releases on {{due_date}}. It settles to your verified bank account ending {{bank_last4}} within two working days.\n\nYou can track it any time in the ADX app.",
            },
            sms: {
                body: "ADX: {{amount}} for {{order_id}} releases on {{due_date}} to your account ending {{bank_last4}}.",
            },
            push: {
                title: "Payout on the way",
                body: "{{amount}} for {{order_id}} releases {{due_date}}.",
            },
        },
    },
    {
        id: "tpl_payout_failed",
        name: "Payout failed",
        trigger: "Sent when a bank transfer is returned by the settlement partner",
        category: "Payouts",
        status: "live",
        updatedAt: "2026-07-22",
        updatedBy: "Arjun Nair",
        sent30d: 37,
        deliveryRate: 100,
        sending: {
            event: "payout.failed",
            audience: "publishers",
            conditions: [],
            delay: "immediate",
            respectQuietHours: false,
            weeklyCap: 0,
        },
        content: {
            email: {
                subject: "Action needed: payout for {{order_id}} could not be sent",
                body: "Hello {{publisher_name}},\n\nWe could not settle {{amount}} for {{order_id}} to the account ending {{bank_last4}}. The bank returned it with: {{reason}}.\n\nUpdate your bank details in the app and we will retry within one working day.",
            },
            sms: {
                body: "ADX: payout for {{order_id}} failed ({{reason}}). Update your bank details in the app to retry.",
            },
        },
    },
    {
        id: "tpl_kyc_approved",
        name: "KYC approved",
        trigger: "Sent when a reviewer approves a publisher's verification",
        category: "KYC",
        status: "live",
        updatedAt: "2026-07-30",
        updatedBy: "Meera Krishnan",
        sent30d: 612,
        deliveryRate: 98.4,
        sending: {
            event: "kyc.approved",
            audience: "publishers",
            conditions: [],
            delay: "immediate",
            respectQuietHours: true,
            weeklyCap: 1,
        },
        content: {
            email: {
                subject: "You're verified on ADX",
                body: "Hello {{publisher_name}},\n\nYour verification is complete. You can now list inventory, accept bookings and receive payouts.\n\nAdd your first site to start receiving orders.",
            },
            push: {
                title: "You're verified",
                body: "Your ADX account is verified. Add a site to start receiving orders.",
            },
        },
    },
    {
        id: "tpl_kyc_reupload",
        name: "KYC needs re-upload",
        trigger: "Sent when a reviewer requests a clearer or corrected document",
        category: "KYC",
        status: "live",
        updatedAt: "2026-08-01",
        updatedBy: "Meera Krishnan",
        sent30d: 148,
        deliveryRate: 97.9,
        sending: {
            event: "kyc.reupload_requested",
            audience: "publishers",
            conditions: [
                { id: "tpl_kyc_reupload-c1", field: "KYC attempt", operator: "is less than", value: "3" },
            ],
            delay: "immediate",
            respectQuietHours: true,
            weeklyCap: 3,
        },
        content: {
            email: {
                subject: "One document needs another look",
                body: "Hello {{publisher_name}},\n\nWe could not verify one of your documents. {{reason}}\n\nUpload a replacement in the app and we will review it within one working day.",
            },
            sms: {
                body: "ADX: a KYC document needs re-uploading. {{reason}} Open the app to fix it.",
            },
        },
    },
    {
        id: "tpl_order_assigned",
        name: "Order assigned",
        trigger: "Sent to a field agent the moment an order is assigned to them",
        category: "Orders",
        status: "live",
        updatedAt: "2026-08-09",
        updatedBy: "Priya Rao",
        sent30d: 1904,
        deliveryRate: 99.6,
        sending: {
            event: "order.assigned",
            audience: "agents",
            conditions: [],
            delay: "immediate",
            respectQuietHours: false,
            weeklyCap: 0,
        },
        content: {
            push: {
                title: "New order: {{site_name}}",
                body: "{{order_id}} is assigned to you. Due {{due_date}}.",
            },
            sms: {
                body: "ADX: {{order_id}} at {{site_name}} is assigned to you. Due {{due_date}}.",
            },
        },
    },
    {
        id: "tpl_proof_reminder",
        name: "Proof review reminder",
        trigger: "Sent when mounting proof has been waiting on review for over 24 hours",
        category: "Orders",
        status: "draft",
        updatedAt: "2026-08-10",
        updatedBy: "Rohit Bhat",
        sent30d: 0,
        deliveryRate: null,
        sending: {
            event: "order.overdue",
            audience: "agents",
            conditions: [
                { id: "tpl_proof_reminder-c1", field: "Days overdue", operator: "is greater than", value: "1" },
                { id: "tpl_proof_reminder-c2", field: "Order priority", operator: "is not", value: "Low" },
            ],
            delay: "24h",
            respectQuietHours: true,
            weeklyCap: 2,
        },
        content: {
            push: {
                title: "Proof still waiting",
                body: "{{order_id}} has been awaiting proof review for over a day.",
            },
        },
    },
    {
        id: "tpl_dispute_raised",
        name: "Dispute raised",
        trigger: "Sent to the publisher when an advertiser opens a dispute",
        category: "Disputes",
        status: "live",
        updatedAt: "2026-06-18",
        updatedBy: "Arjun Nair",
        sent30d: 86,
        deliveryRate: 99.0,
        sending: {
            event: "dispute.raised",
            audience: "publishers",
            conditions: [],
            delay: "immediate",
            respectQuietHours: false,
            weeklyCap: 0,
        },
        content: {
            email: {
                subject: "A dispute was raised on {{order_id}}",
                body: "Hello {{publisher_name}},\n\n{{dispute_id}} has been raised against {{order_id}} at {{site_name}}. Reason given: {{reason}}\n\nRespond with evidence within 72 hours or the refund is processed automatically.",
            },
        },
    },
    {
        id: "tpl_dispute_resolved",
        name: "Dispute resolved",
        trigger: "Sent to both parties once a dispute reaches a final decision",
        category: "Disputes",
        status: "live",
        updatedAt: "2026-06-18",
        updatedBy: "Arjun Nair",
        sent30d: 74,
        deliveryRate: 99.3,
        sending: {
            event: "dispute.resolved",
            audience: "publishers",
            conditions: [],
            delay: "immediate",
            respectQuietHours: true,
            weeklyCap: 0,
        },
        content: {
            email: {
                subject: "{{dispute_id}} has been resolved",
                body: "Hello {{publisher_name}},\n\n{{dispute_id}} on {{order_id}} is now closed. Outcome: {{reason}}\n\nAny adjustment appears on your next payout.",
            },
            push: {
                title: "Dispute closed",
                body: "{{dispute_id}} on {{order_id}} has been resolved.",
            },
        },
    },
    {
        id: "tpl_account_suspended",
        name: "Account suspended",
        trigger: "Retired in June 2026, replaced by the moderation notice flow",
        category: "Account",
        status: "archived",
        updatedAt: "2026-06-02",
        updatedBy: "Priya Rao",
        sent30d: 0,
        deliveryRate: null,
        sending: {
            event: "account.suspended",
            audience: "publishers",
            conditions: [],
            delay: "immediate",
            respectQuietHours: false,
            weeklyCap: 1,
        },
        content: {
            email: {
                subject: "Your ADX account has been suspended",
                body: "Hello {{publisher_name}},\n\nYour account has been suspended. {{reason}}\n\nContact support if you believe this is a mistake.",
            },
        },
    },
];

export const getNotificationTemplate = (id: string) =>
    notificationTemplates.find((template) => template.id === id);
