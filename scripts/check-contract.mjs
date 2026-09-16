/**
 * The console's contract with the backend — four audits over the source
 * tree and the backend's own artefacts (Q-C, item 12).
 *
 * The backend publishes `docs/route-inventory.json` (every route, method
 * and middleware chain) and `prisma/schema.prisma` (every enum and model).
 * Both are read through a relative path from the sibling package; the
 * check fails with a clear message when either is absent rather than
 * passing on nothing.
 *
 *  (a) Routes — every path a service calls (`http.get(...)`, `live().post`,
 *      `session().patch`, `api.get`; template params normalised to `:param`)
 *      exists in the inventory with that method. A `${base}` prefix and a
 *      `${path(id)}` helper are resolved from the file's own `const`; a
 *      path that cannot be resolved to a literal is counted and skipped.
 *  (b) Enums — every `*_META` / `*_LABEL` / `*_LABELS` / `*_TONE` record
 *      registered below covers its backend enum's values exactly. The
 *      REGISTRY maps `file:RECORD` to the enum's name; a record keyed on a
 *      UI-derived union is simply not registered.
 *  (c) Emptiness of `src/types` (the owner's item 9: vocabulary comes from
 *      `services/`, not `types/`) — no exported lowercase string-literal
 *      union there mirrors a backend enum. ALLOWED_UNIONS lists the five
 *      UI-derived ones.
 *  (d) Wire nullability — the inventory carries no response shapes, so this
 *      reads nullability off `schema.prisma` instead: a `Wire<Model>`
 *      interface whose name is a Prisma model must type every field the
 *      model marks `?` with `| null` (or `unknown`); any other `Wire*`
 *      field named `*At` / `*Id` must carry `| null` when every model
 *      holding that name marks it optional. A name optional in one model
 *      and required in another is ambiguous by name and skipped.
 *  (e) Response shapes — EVERY exported interface a service names in the
 *      generic of an `http.get/post/patch/put<T>(path)` call (not only
 *      `Wire*`): a required field the backend's response never carries is
 *      a failure. The shape comes from the inventory row when it carries
 *      one (`response.fields`); otherwise the script follows the route's
 *      handler (the last name of its middleware chain) into the module's
 *      `*.controller.ts`, takes what it answers with (`res.json({ data })`,
 *      `ok(res, x)`), and follows that call through the module's service /
 *      mapper / repository files to a Prisma `select`, a `findMany` over
 *      a model (the schema's scalar fields plus `include`), or a returned
 *      object literal. A trace it cannot close — a spread, a helper it
 *      cannot find, a wrapped generic — is reported as `unverifiable`, not
 *      passed. `--verbose` lists every unverifiable call with its reason.
 *
 * KNOWN_DEBT lists findings that reproduce today in files this package may
 * not edit; they are printed, not failed, and an entry that stops
 * reproducing fails the check so the list cannot rot. Empty since R-C,
 * and again since T-C.
 *
 * Run with `npm run check:contract`; `npm run verify` runs it too. Every
 * audit is a pure function over text so `src/lib/check-contract.test.ts`
 * can drive it with fixtures; `main()` is the walk plus the exit code.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved when main() runs, not at import: the test imports this module
// through Vitest, whose module URLs are not file: URLs. fileURLToPath, not
// URL.pathname: the repository path contains spaces.
const root = () => fileURLToPath(new URL('..', import.meta.url));

/** The backend package, a sibling of the console in the monorepo. */
export const BACKEND_DIR = join('..', 'ADX-backendv1');
export const INVENTORY_PATH = join(BACKEND_DIR, 'docs', 'route-inventory.json');
export const SCHEMA_PATH = join(BACKEND_DIR, 'prisma', 'schema.prisma');

/** What the API client prepends to every path a service names. */
export const API_PREFIX = '/api/v1';

/* ------------------------------------------------------------------ */
/* (b) the registry — `file:RECORD` -> backend enum                    */
/* ------------------------------------------------------------------ */

/**
 * Every `*_META` / `*_LABEL` record keyed on a backend enum, by the file
 * that declares it (two files may share a record name — `PARTY_LABEL` in
 * agreements is keyed on a UI-only party union and is not here). Add a row
 * when a new record mirrors an enum; the audit fails when a registered
 * record is missing or when the record and the enum disagree.
 */
export const REGISTRY = {
    'services/agreements.ts:KIND_META': 'AgreementKind',
    'services/announcements.ts:ANNOUNCEMENT_STATUS_META': 'AnnouncementStatus',
    'services/announcements.ts:AUDIENCE_LABEL': 'AnnouncementAudience',
    'services/campaigns.ts:CAMPAIGN_STATUS_TONE': 'CampaignStatus',
    'services/comms.ts:CHANNEL_LABEL': 'NotificationChannel',
    'services/comms.ts:DELIVERY_STATUS_META': 'DeliveryStatus',
    'services/comms.ts:TEMPLATE_STATUS_META': 'TemplateStatus',
    'services/disputes.ts:OUTCOME_LABEL': 'DisputeOutcome',
    'services/employees.ts:EMPLOYMENT_TYPE_META': 'EmploymentType',
    'services/employees.ts:HOLIDAY_KIND_META': 'HolidayKind',
    'services/employees.ts:WORK_MODE_META': 'WorkMode',
    'services/finance.ts:BANK_LINE_STATUS_META': 'BankLineMatchStatus',
    'services/finance.ts:INCENTIVE_EVENT_LABEL': 'IncentiveEvent',
    'services/finance.ts:INCENTIVE_STATUS_META': 'IncentiveStatus',
    'services/finance.ts:LEDGER_KIND_LABEL': 'LedgerTransactionKind',
    'services/finance.ts:PAYOUT_BATCH_STATUS_META': 'PayoutBatchStatus',
    'services/finance.ts:PAYOUT_METHOD_STATUS_META': 'PayoutMethodStatus',
    'services/finance.ts:RAIL_LABEL': 'PayoutRailName',
    'services/finance.ts:SIZE_BAND_LABEL': 'PartySizeBand',
    'services/finance.ts:VERIFIED_VIA_LABEL': 'PayoutVerificationMethod',
    'services/finance.ts:WITHDRAWAL_STATUS_META': 'WithdrawalStatus',
    'services/flags.ts:FLAG_SOURCE_LABEL': 'FlagSource',
    'services/fraud.ts:FRAUD_CASE_STATUS_META': 'FraudCaseStatus',
    'services/geo.ts:CITY_STAGE_LABEL': 'CityStage',
    'services/health.ts:INCIDENT_SEVERITY_META': 'IncidentSeverity',
    'services/health.ts:INCIDENT_STATUS_META': 'IncidentStatus',
    'services/identifiers.ts:PARTY_LABEL': 'PartyType',
    'services/invoices.ts:INVOICE_KIND_LABEL': 'InvoiceKind',
    'services/invoices.ts:INVOICE_KIND_META': 'InvoiceKind',
    'services/invoices.ts:INVOICE_STATUS_META': 'InvoiceStatus',
    'services/invoices.ts:LINE_KIND_LABEL': 'InvoiceLineKind',
    'services/invoices.ts:PUBLISHER_INVOICE_STATUS_META': 'PublisherInvoiceStatus',
    'services/kyc.ts:ESCALATION_SOURCE_LABEL': 'KycEscalationSource',
    'services/landing-pages.ts:LANDING_PAGE_STATUS_META': 'LandingPageStatus',
    'services/leads.ts:LEAD_ACTIVITY_LABEL': 'LeadActivityKind',
    'services/leads.ts:LEAD_SIDE_LABEL': 'LeadSide',
    'services/legal.ts:SAFETY_KIND_LABEL': 'SafetyAlertKind',
    'services/legal.ts:SAFETY_STATUS_META': 'SafetyAlertStatus',
    'services/listing-review.ts:CONTENT_STANCE_META': 'ContentStance',
    'services/listing-review.ts:DOCUMENT_KIND_LABEL': 'ListingDocumentKind',
    'services/listing-review.ts:DOCUMENT_STATUS_META': 'ListingDocumentStatus',
    'services/listing-review.ts:PRICING_UNIT_LABEL': 'PricingUnit',
    'services/moderation.ts:CREATIVE_PATH_LABEL': 'CreativePath',
    'services/moderation.ts:CREATIVE_STATUS_META': 'CreativeStatus',
    'services/notifications.ts:NOTIFICATION_CHANNEL_LABEL': 'NotificationChannel',
    'services/notifications.ts:NOTIFICATION_TYPE_LABEL': 'NotificationType',
    'services/notifications.ts:NOTIFICATION_TYPE_TONE': 'NotificationType',
    'services/overview.ts:LISTING_CATEGORY_LABEL': 'ListingCategory',
    'services/packages.ts:PACKAGE_SALE_STATUS_META': 'PackageSaleStatus',
    'services/packages.ts:TIER_LABEL': 'PackageTier',
    'services/payments.ts:GATEWAY_LABEL': 'PaymentGateway',
    'services/payments.ts:PAYMENT_STATUS_META': 'PaymentStatus',
    'services/payments.ts:REFUND_STATUS_META': 'PaymentRefundStatus',
    'services/price-model.ts:CATEGORY_EFFECT_META': 'CategoryRuleEffect',
    'services/price-model.ts:QUOTE_STATUS_META': 'QuoteStatus',
    'services/print-partners.ts:PRINT_JOB_STATUS_META': 'PrintJobStatus',
    'services/print-partners.ts:QUOTE_REQUEST_STATUS_META': 'PrintQuoteRequestStatus',
    'services/print-partners.ts:QUOTE_STATUS_META': 'PrintQuoteStatus',
    'services/publishers.ts:ACCOUNT_ACTIVITY_KIND_LABEL': 'AccountActivityKind',
    'services/publishers.ts:PUBLISHER_TYPE_LABEL': 'PublisherType',
    'services/qr.ts:QR_TYPE_LABEL': 'QrType',
    'services/rate-cards.ts:APPROVAL_SOURCE_LABEL': 'PriceApprovalSource',
    'services/rate-cards.ts:GRADE_LABEL': 'RateGrade',
    'services/rate-cards.ts:RATE_CARD_STATE_META': 'RateCardStatus',
    'services/refunds.ts:CAMPAIGN_REFUND_STATUS_META': 'CampaignRefundStatus',
    'services/refunds.ts:REFUND_DESTINATION_LABEL': 'RefundDestination',
    'services/refunds.ts:REFUND_REASON_LABEL': 'RefundReason',
    'services/refunds.ts:REFUND_REQUEST_STATUS_META': 'RefundRequestStatus',
    'services/reports.ts:CADENCE_LABEL': 'ReportCadence',
    'services/reports.ts:RUN_STATUS_META': 'ReportRunStatus',
    'services/revenue.ts:SUBSCRIPTION_SOURCE_LABEL': 'SubscriptionSource',
    'services/reviews.ts:REVIEW_STATUS_META': 'ReviewStatus',
    'services/supply.ts:KYC_TONE': 'KycStatus',
    'services/supply.ts:LISTING_CLAIM_STATUS_META': 'ListingClaimStatus',
    'services/supply.ts:VERIFICATION_STATUS_META': 'VerificationStatus',
    'services/suspension.ts:SCOPE_LABEL': 'SuspensionScope',
    'services/users.ts:CLOSURE_DECISION_META': 'ClosureDecision',
    'services/users.ts:CONTACT_KIND_LABEL': 'ContactKind',
    'services/users.ts:ERASURE_STATUS_META': 'ErasureStatus',
    'services/users.ts:ERASURE_VIA_LABEL': 'ErasureVia',
    'services/visits.ts:VISIT_KIND_LABEL': 'FieldVisitKind',
    'services/visits.ts:VISIT_STATUS_META': 'FieldVisitStatus',
    'types/accounts.ts:ADVERTISER_KYC_STATUS_META': 'KycStatus',
    'types/accounts.ts:ADVERTISER_KYC_TYPE_META': 'AdvertiserType',
    'types/advertisers.ts:ADVERTISER_TYPE_LABELS': 'AdvertiserType',
    'types/advertisers.ts:BRAND_SECTOR_META': 'BrandSector',
    'types/advertisers.ts:WALLET_ENTRY_META': 'WalletEntryType',
    'types/directory.ts:KYC_STATUS_META': 'KycStatus',
    'types/finance.ts:KYC_CASE_STATUS_META': 'KycStatus',
    'types/identifiers.ts:PARTY_LABELS': 'PartyType',
    'types/marketplace.ts:ORDER_STATUS_META': 'OrderStatus',
    'types/platform.ts:TICKET_PRIORITY_META': 'TicketPriority',
    'types/platform.ts:TICKET_STATUS_META': 'TicketStatus',
    'types/pricing-engine.ts:FACTOR_MODE_META': 'PricingFactorMode',
    'types/supply.ts:ATTEMPT_ORIGIN_META': 'ListingAttemptOrigin',
    'types/supply.ts:ATTEMPT_STATUS_META': 'ListingAttemptStatus',
    'types/supply.ts:COMPLIANCE_STATUS_META': 'ComplianceCaseStatus',
    'types/supply.ts:LISTING_LIFECYCLE_META': 'ListingStatus',
    'types/supply.ts:VERIFICATION_REVIEW_META': 'VerificationStatus',
    'types/supply.ts:VERIFICATION_TYPE_META': 'VerificationType',
    'types/work.ts:WORK_ISSUE_SEVERITY_META': 'WorkIssueSeverity',
    'types/work.ts:WORK_ISSUE_STATUS_META': 'WorkIssueStatus',
    'types/work.ts:WORK_PRIORITY_META': 'WorkPriority',
    'types/work.ts:WORK_PROJECT_KIND_LABEL': 'WorkProjectKind',
    'types/work.ts:WORK_TASK_STATUS_META': 'WorkTaskStatus',
};

/**
 * The five UI-derived unions `src/types` may keep (item 12c). `AgentStatus`
 * is the badge the roster draws, not a spelling of `AgentProfileStatus`:
 * its `deactivated` folds `User.isActive === false` — a boolean on another
 * model — over the profile's three states (`services/agents.ts:agentStatus`),
 * the way `DisputeStatus` folds the SLA into `sla_breach`.
 */
export const ALLOWED_UNIONS = ['DisputeStatus', 'FunnelGate', 'OnboardingStepKind', 'FulfilmentRequirementKind', 'AgentStatus'];

/**
 * Findings that reproduce today in files another package owns. Each entry
 * is the problem line — matched exactly, or with the `:line` after the
 * file name ignored, so an edit above the call does not turn debt into a
 * failure; it is printed as debt rather than failed, and once it stops
 * reproducing the stale entry fails the check so it gets removed. The
 * summary line always prints the count, so "0 known debt(s)" is a
 * statement, not an absence.
 *
 * S-C (15 Sep 2026): the widened audit (e) found twenty-eight on its first
 * run — one shape: a service reused its list/detail interface for a write
 * route whose handler answered the bare row, so the fields the view mapper
 * adds (`order`, `campaign`, `memberCount`, `createdBy`, `pill`...) were
 * typed required and never arrived. T-B (backend) made every such write
 * answer the same view as its GET; T-C (console) typed the three envelopes
 * that stay envelopes — `PUT /integrations` `{ message, ...view }`,
 * `submit-for-payment` `{ campaign, review, reservedUntil }`, `refund`
 * `{ refund, payment }` — and the list went back to empty.
 */
export const KNOWN_DEBT = [];

/* ------------------------------------------------------------------ */
/* Parsers                                                             */
/* ------------------------------------------------------------------ */

/** The schema with every `//` and `///` comment removed — a doc comment may hold a brace (`{PREFIX}`), and so may a default string. */
function schemaWithoutComments(schema) {
    return schema.replace(/\/\/.*$/gm, '');
}

/** Every `<kind> Name { ... }` block of the schema, its body read to the matching brace rather than the first `}`. */
function schemaBlocks(schema, kind) {
    const clean = schemaWithoutComments(schema);
    const blocks = [];
    for (const match of clean.matchAll(new RegExp(`^${kind}\\s+(\\w+)\\s*\\{`, 'gm'))) {
        blocks.push({ name: match[1], body: balanced(clean, match.index + match[0].length - 1).body });
    }
    return blocks;
}

/** `enum Name { A B C }` blocks of a Prisma schema, comments stripped. */
export function parseEnums(schema) {
    const enums = new Map();
    for (const { name, body } of schemaBlocks(schema, 'enum')) {
        const values = body
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('@'))
            .map((line) => line.split(/\s+/)[0]);
        enums.set(name, values);
    }
    return enums;
}

const SCALARS = new Set(['String', 'DateTime', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'Json', 'Bytes']);

/** `model Name { field Type? ... }` blocks: scalar and enum fields with their nullability; relations are left out. */
export function parseModels(schema) {
    const enums = parseEnums(schema);
    const models = new Map();
    for (const { name: model, body } of schemaBlocks(schema, 'model')) {
        const fields = new Map();
        for (const raw of body.split('\n')) {
            const line = raw.trim();
            if (!line || line.startsWith('@')) continue;
            const field = line.match(/^(\w+)\s+([\w.]+)(\[\])?(\?)?/);
            if (!field) continue;
            const [, name, type, list, optional] = field;
            if (!SCALARS.has(type) && !enums.has(type)) continue;
            fields.set(name, { type, optional: Boolean(optional), list: Boolean(list) });
        }
        models.set(model, fields);
    }
    return models;
}

/** The body between the brace at `open` and its match; returns the text and the index after the closing brace. */
function balanced(source, open, openChar = '{', closeChar = '}') {
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === openChar) depth++;
        else if (source[i] === closeChar && --depth === 0) return { body: source.slice(open + 1, i), end: i + 1 };
    }
    return { body: source.slice(open + 1), end: source.length };
}

/** Identifiers at depth one of an object literal body followed by `:`. */
function topLevelKeys(body) {
    const keys = [];
    let depth = 0;
    let token = '';
    let quote = null;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
            if (c === quote && body[i - 1] !== '\\') quote = null;
            token += c;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            token += c;
            continue;
        }
        if (c === '{' || c === '(' || c === '[') {
            depth++;
            continue;
        }
        if (c === '}' || c === ')' || c === ']') {
            depth--;
            continue;
        }
        if (depth !== 0) continue;
        if (c === ',') {
            token = '';
            continue;
        }
        if (c === ':') {
            const key = token.trim().replace(/^["']|["']$/g, '');
            if (/^[A-Za-z0-9_-]+$/.test(key)) keys.push(key);
            token = '';
            continue;
        }
        token += c;
    }
    return keys;
}

/** Strips block and line comments so a commented-out call is not a call. */
function withoutComments(source) {
    // A block comment leaves its newlines behind so line numbers still point at the source.
    return source
        .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
        .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}

/**
 * `const base = "/finance"` and `const path = (id) => \`/announcements/${id}\``
 * at the top level of a service, plus `const base = cond ? "/a" : "/b"` —
 * what a template's `${base}` or `${path(id)}` resolves to. A ternary
 * expands to every branch; a template's own `${}` becomes `:param`.
 */
export function constantsOf(source) {
    const constants = new Map();
    const clean = withoutComments(source);
    const literal = `"[^"]*"|'[^']*'`;
    const whole = new RegExp(`^(?:${literal})$`);
    // A ternary chain whose every branch is a literal; the conditions may
    // name anything, only the branches are taken.
    const ternary = new RegExp(`^(?:[^?]+\\?\\s*(?:${literal})\\s*:\\s*)+(?:${literal})$`);
    // `const name[: type] = <expression>;` — the expression is a one-liner, a
    // ternary continued on `?`/`:` lines, or a one-level object literal.
    const declaration = /^\s*(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=\n]+?)?\s*=\s*(\{[^{}]*\}|[^;\n]+(?:\n\s+[?:][^;\n]+)*);/gm;
    for (const match of clean.matchAll(declaration)) {
        const [, name, raw] = match;
        const expression = raw.replace(/\s+/g, ' ').trim();
        if (whole.test(expression)) {
            constants.set(name, [expression.slice(1, -1)]);
            continue;
        }
        if (ternary.test(expression)) {
            constants.set(name, [...expression.matchAll(/[?:]\s*("[^"]*"|'[^']*')/g)].map((m) => m[1].slice(1, -1)));
            continue;
        }
        // `const PATHS: Record<K, string> = { A: "x", B: "y" }` — `${PATHS[k]}` resolves to every value.
        const record = expression.match(/^\{(.*)\}$/);
        if (record && /^(?:\s*\w+\s*:\s*(?:"[^"]*"|'[^']*')\s*,?\s*)+$/.test(record[1])) {
            constants.set(name, [...record[1].matchAll(/:\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]));
            continue;
        }
        const arrow = expression.match(/^\((?:[^)]*)\)\s*=>\s*`([^`]*)`$/) ?? expression.match(/^\w+\s*=>\s*`([^`]*)`$/);
        if (arrow) constants.set(name, [arrow[1].replace(/\$\{[^}]*\}/g, ':param')]);
    }
    return constants;
}

/**
 * A call on the API client: `http.`, `api.`, or any zero-argument accessor
 * that hands the client back (`live()`, `session()`, `mutable()`, `desk()`).
 * The generic — the type the service says comes back — is captured for (e).
 */
const CALL = /\b(?:http|api|[a-z]\w*\(\))\.(get|post|patch|put|delete|getEnvelope|blob)\b(?:<([^(]*?)>)?\(\s*([`"'])/g;

/** Reads a string literal from `start` (just after the opening quote), honouring `${}` inside a template. */
function readLiteral(source, start, quote) {
    let depth = 0;
    let out = '';
    for (let i = start; i < source.length; i++) {
        if (quote === '`' && source.startsWith('${', i)) {
            depth++;
            out += '${';
            i++;
            continue;
        }
        if (quote === '`' && depth > 0 && source[i] === '}') {
            depth--;
            out += '}';
            continue;
        }
        if (source[i] === quote && depth === 0) return out;
        out += source[i];
    }
    return out;
}

/** The path up to the first `?` outside a `${}` — a `?` inside a template expression is a ternary, not a query. */
function withoutQuery(candidate) {
    let depth = 0;
    for (let i = 0; i < candidate.length; i++) {
        if (candidate.startsWith('${', i)) depth++;
        else if (candidate[i] === '}' && depth > 0) depth--;
        else if (candidate[i] === '?' && depth === 0) return candidate.slice(0, i);
    }
    return candidate;
}

/**
 * Normalises one path literal to the shapes the inventory can be asked
 * about: `${base}` prefixes resolved (every branch), a `${}` that is a whole
 * segment becomes `:param`, a `${}` glued to a segment (`/users${qs}`, a
 * query helper; `image.${kind}`, a suffix) becomes `*` and matches that
 * segment by glob, and `?query` is dropped. Returns null when the path
 * cannot be resolved to a literal.
 */
export function normalisePath(literal, constants = new Map()) {
    // Expand every `${name}`, `${name(...)}` and `${name[...]}` that names a
    // known constant, wherever it sits, into one candidate per value.
    let candidates = [literal];
    const reference = /\$\{(\w+)(?:\([^)]*\)|\[[^\]]*\])?\}/g;
    for (let pass = 0; pass < 4; pass++) {
        const next = [];
        let expanded = false;
        for (const candidate of candidates) {
            let hit = null;
            for (const match of candidate.matchAll(reference)) {
                if (constants.has(match[1])) {
                    hit = match;
                    break;
                }
            }
            if (!hit) {
                next.push(candidate);
                continue;
            }
            expanded = true;
            for (const value of constants.get(hit[1])) {
                next.push(candidate.slice(0, hit.index) + value + candidate.slice(hit.index + hit[0].length));
            }
        }
        candidates = next;
        if (!expanded) break;
    }
    const out = [];
    for (const candidate of candidates) {
        if (candidate.startsWith('${')) return null;
        let path = withoutQuery(candidate);
        // A `${}` that is the whole segment is a route param.
        path = path.replace(/(^|\/)\$\{[^}]*\}(?=\/|$)/g, '$1:param');
        // One glued to a segment (`/users${qs}`, `image.${kind}`) matches the rest of that segment by glob.
        path = path.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '*');
        if (!path.startsWith('/')) return null;
        out.push(path.replace(/\/+$/, '') || '/');
    }
    return out;
}

/** Every HTTP call a service makes: `{ method, path, line }`, or `{ method, unresolved, line }`. */
export function extractCalls(source) {
    const clean = withoutComments(source);
    const constants = constantsOf(source);
    const calls = [];
    for (const match of clean.matchAll(CALL)) {
        const literal = readLiteral(clean, match.index + match[0].length, match[3]);
        const verb = match[1];
        const method = verb === 'getEnvelope' || verb === 'blob' ? 'GET' : verb.toUpperCase();
        const line = clean.slice(0, match.index).split('\n').length;
        const generic = match[2] ? match[2].trim() : null;
        const paths = normalisePath(literal, constants);
        if (!paths) calls.push({ method, verb, generic, unresolved: literal, line });
        else for (const path of paths) calls.push({ method, verb, generic, path, line });
    }
    return calls;
}

/** The inventory row `method path` resolves to — the first that matches, as Express would take it — or null. */
export function routeFor(routes, method, path) {
    const want = path.split('/');
    return (
        routes.find((route) => {
            if (route.method !== method) return false;
            const have = route.path.split('/');
            // An inventory param takes any console segment — a literal (`/log/advertiser/`) or a `:param` alike.
            return have.length === want.length && have.every((segment, i) => segmentMatches(segment, want[i]));
        }) ?? null
    );
}

/** An inventory segment takes a console segment when they are equal, when the inventory's is a param, or when the console's glob (`image.*`) covers it. */
function segmentMatches(have, want) {
    if (have === want || have.startsWith(':')) return true;
    if (!want.includes('*')) return false;
    return new RegExp(`^${want.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(have);
}

/** True when the inventory lists `method path` with `:param` matching any `:name` segment. */
export function routeExists(routes, method, path) {
    return routeFor(routes, method, path) !== null;
}

/** `export const NAME: Record<Key, ...> = { ... }` records whose name ends in _META, _LABEL, _LABELS or _TONE. */
export function extractRecords(source) {
    const records = [];
    const clean = withoutComments(source);
    const pattern = /export const ([A-Z0-9_]+_(?:META|LABELS?|TONE))\s*:\s*(Partial<)?Record<\s*([A-Za-z0-9_"' |]+?)\s*,/g;
    for (const match of clean.matchAll(pattern)) {
        // Skip the rest of the type annotation (it may hold its own braces)
        // to the `=` at depth zero; the literal opens after it.
        let i = match.index + match[0].length;
        for (let depth = 1; i < clean.length && !(depth === 0 && clean[i] === '='); i++) {
            if (clean[i] === '<' || clean[i] === '{' || clean[i] === '(') depth++;
            else if (clean[i] === '>' || clean[i] === '}' || clean[i] === ')') depth--;
        }
        const open = clean.indexOf('{', i);
        // A record built by a call rather than written as a literal has more than whitespace before its brace.
        if (open === -1 || clean.slice(i + 1, open).trim() !== '') continue;
        const { body } = balanced(clean, open);
        records.push({ name: match[1], partial: Boolean(match[2]), keyType: match[3].trim(), keys: topLevelKeys(body) });
    }
    return records;
}

/** `export type Name = "a" | "b"` unions whose members are all lowercase. */
export function extractLowercaseUnions(source) {
    const unions = [];
    const pattern = /export type (\w+)\s*=\s*((?:\s*\|?\s*"[^"]*")+)\s*;/g;
    for (const match of withoutComments(source).matchAll(pattern)) {
        const members = [...match[2].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        if (members.length >= 2 && members.every((m) => /^[a-z][a-z0-9_-]*$/.test(m))) unions.push({ name: match[1], members });
    }
    return unions;
}

/**
 * Every `export interface X { ... }` (or `type X = { ... }`) with each
 * depth-one field's name, optionality and type text, the parents it
 * `extends`, and whether it is open — an index signature or an
 * intersection means the wire may carry more than the fields listed.
 */
/** The depth-one fields of an object type's body — name, optionality, type text — and whether an index signature opens it. */
export function fieldsOfTypeBody(body) {
    const fields = [];
    let open = false;
    let depth = 0;
    let line = '';
    const flush = () => {
        const field = line.match(/^\s*(?:readonly\s+)?(\w+)(\?)?\s*:\s*([\s\S]+)$/);
        if (field) fields.push({ name: field[1], optional: Boolean(field[2]), type: field[3].trim() });
        else if (/^\s*\[/.test(line)) open = true;
        line = '';
    };
    for (const c of body) {
        if (c === '{' || c === '(' || c === '<') depth++;
        if (c === '}' || c === ')' || c === '>') depth--;
        if ((c === ';' || c === '\n') && depth === 0 && /:\s*\S/.test(line)) flush();
        else line += c;
    }
    flush();
    return { fields, open };
}

export function extractInterfaces(source) {
    const interfaces = [];
    const clean = withoutComments(source);
    const pattern = /(?:^|\n)[ \t]*(?:export\s+)?(?:declare\s+)?(?:interface|type)\s+(\w+)\b([^{;=]*(?:=\s*)?[^{;]*)\{/g;
    for (const match of clean.matchAll(pattern)) {
        const head = match[2];
        const { body } = balanced(clean, match.index + match[0].length - 1);
        const { fields, open: indexed } = fieldsOfTypeBody(body);
        const open = indexed || /&/.test(head) || /\b(?:Omit|Pick|Partial|Record)\s*</.test(head);
        const parents = [...(head.match(/extends\s+([^{]+)/)?.[1] ?? '').matchAll(/(\w+)(?:<[^>]*>)?/g)].map((m) => m[1]);
        interfaces.push({ name: match[1], fields, parents, open });
    }
    return interfaces;
}

/** The `Wire*` interfaces — what (d) audits. */
export function extractWireInterfaces(source) {
    return extractInterfaces(source).filter((iface) => iface.name.startsWith('Wire'));
}

/* ------------------------------------------------------------------ */
/* The audits                                                          */
/* ------------------------------------------------------------------ */

/** (a) — `files` is `{ 'services/x.ts': source }`. */
export function auditRoutes(files, routes) {
    const problems = [];
    let checked = 0;
    let skipped = 0;
    for (const [file, source] of Object.entries(files)) {
        for (const call of extractCalls(source)) {
            if (call.unresolved !== undefined) {
                skipped++;
                continue;
            }
            checked++;
            if (!routeExists(routes, call.method, API_PREFIX + call.path)) {
                problems.push(`${file}:${call.line}: ${call.method} ${call.path} is not in the backend's route inventory`);
            }
        }
    }
    return { problems, checked, skipped };
}

/**
 * (b) — `files` is `{ 'services/x.ts': source, 'types/y.ts': source }`.
 * @param {Record<string, string>} files
 * @param {Map<string, string[]>} enums
 * @param {Record<string, string>} registry
 */
export function auditEnums(files, enums, registry = REGISTRY) {
    const problems = [];
    const seen = new Set();
    const sorted = (values) => [...values].sort();
    for (const [file, source] of Object.entries(files)) {
        for (const record of extractRecords(source)) {
            const key = `${file}:${record.name}`;
            const enumName = registry[key];
            if (!enumName) continue;
            seen.add(key);
            const values = enums.get(enumName);
            if (!values) {
                problems.push(`${file}: ${record.name} is registered against enum ${enumName}, which schema.prisma does not define`);
                continue;
            }
            if (record.partial) {
                problems.push(`${file}: ${record.name} is a Partial record — a registered record must cover enum ${enumName} whole`);
                continue;
            }
            const missing = values.filter((v) => !record.keys.includes(v));
            const extra = record.keys.filter((k) => !values.includes(k));
            if (missing.length > 0 && extra.length === 0) {
                problems.push(`${file}: ${record.name} misses [${sorted(missing).join(', ')}] of enum ${enumName}`);
            } else if (missing.length > 0 || extra.length > 0) {
                problems.push(`${file}: ${record.name} covers [${sorted(record.keys).join(', ')}] but enum ${enumName} is [${sorted(values).join(', ')}]`);
            }
        }
    }
    for (const key of Object.keys(registry)) {
        if (!seen.has(key)) problems.push(`registry names ${key}, which no file declares — the record moved, or the registry is stale`);
    }
    return { problems, checked: seen.size };
}

/**
 * (c) — a union mirrors an enum when an enum of the same name exists, or
 * when two or more of its members, upper-cased, are values of an enum that
 * shares the union's leading camel-case word (KycCaseStatus -> Kyc*).
 */
export function auditUnions(files, enums, allowed = ALLOWED_UNIONS) {
    const problems = [];
    let checked = 0;
    for (const [file, source] of Object.entries(files)) {
        for (const union of extractLowercaseUnions(source)) {
            checked++;
            if (allowed.includes(union.name)) continue;
            const upper = union.members.map((m) => m.toUpperCase().replace(/-/g, '_'));
            const lead = union.name.match(/^[A-Z][a-z0-9]*/)?.[0] ?? union.name;
            let mirror = null;
            if (enums.has(union.name)) mirror = { name: union.name, hits: union.members };
            else {
                for (const [name, values] of enums) {
                    if (!name.startsWith(lead)) continue;
                    const hits = union.members.filter((m, i) => values.includes(upper[i]));
                    if (hits.length >= 2 && (!mirror || hits.length > mirror.hits.length)) mirror = { name, hits };
                }
            }
            if (mirror) {
                problems.push(`${file}: ${union.name} is a lowercase union mirroring enum ${mirror.name} (${mirror.hits.join(', ')}) — vocabulary belongs in services/, not types/`);
            }
        }
    }
    return { problems, checked };
}

const nullable = (type) => /\bnull\b/.test(type) || /^(unknown|any)$/.test(type);

/** (d) — see the header. `files` is `{ 'services/x.ts': source }`. */
export function auditNullability(files, models) {
    const problems = [];
    let checked = 0;
    let ambiguous = 0;
    // Nullability by field name across every model, for interfaces that are not a model.
    const byName = new Map();
    for (const fields of models.values()) {
        for (const [name, field] of fields) {
            if (field.list) continue;
            const entry = byName.get(name) ?? { optional: 0, required: 0 };
            entry[field.optional ? 'optional' : 'required']++;
            byName.set(name, entry);
        }
    }
    for (const [file, source] of Object.entries(files)) {
        for (const iface of extractWireInterfaces(source)) {
            const model = models.get(iface.name.slice('Wire'.length));
            for (const field of iface.fields) {
                if (model) {
                    const modelField = model.get(field.name);
                    if (!modelField || modelField.list) continue;
                    checked++;
                    if (modelField.optional && !nullable(field.type)) {
                        problems.push(`${file}: ${iface.name}.${field.name} is typed \`${field.type}\` but ${iface.name.slice(4)}.${field.name} is optional in schema.prisma — add \`| null\``);
                    }
                    continue;
                }
                if (!/(At|Id)$/.test(field.name) || field.name === 'id') continue;
                const entry = byName.get(field.name);
                if (!entry) continue;
                if (entry.optional > 0 && entry.required > 0) {
                    ambiguous++;
                    continue;
                }
                checked++;
                if (entry.optional > 0 && !nullable(field.type)) {
                    problems.push(`${file}: ${iface.name}.${field.name} is typed \`${field.type}\` but every model holding ${field.name} marks it optional — add \`| null\``);
                }
            }
        }
    }
    return { problems, checked, ambiguous };
}

/* ------------------------------------------------------------------ */
/* (e) response shapes — the backend's side                            */
/* ------------------------------------------------------------------ */

/** `{ key, value }` at depth one of an object literal body, in order; a `...spread` is reported as `{ spread: true }`. */
function topLevelEntries(body) {
    const entries = [];
    let depth = 0;
    let token = '';
    let quote = null;
    let key = null;
    const push = () => {
        const value = token.trim();
        if (key !== null) entries.push({ key, value });
        else if (value.startsWith('...')) entries.push({ spread: true, value: value.slice(3) });
        else if (/^[A-Za-z_$][\w$]*$/.test(value)) entries.push({ key: value, value, shorthand: true });
        key = null;
        token = '';
    };
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
            if (c === quote && body[i - 1] !== '\\') quote = null;
            token += c;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            token += c;
            continue;
        }
        if (c === '{' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === ')' || c === ']') depth--;
        if (depth === 0 && c === ',') {
            push();
            continue;
        }
        if (depth === 0 && c === ':' && key === null && !/^\s*\.\.\./.test(token)) {
            key = token.trim().replace(/^["']|["']$/g, '');
            token = '';
            continue;
        }
        token += c;
    }
    if (token.trim()) push();
    return entries;
}

/** Splits a call's argument list at depth-zero commas. */
function splitArguments(text) {
    const out = [];
    let depth = 0;
    let quote = null;
    let token = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            if (c === quote && text[i - 1] !== '\\') quote = null;
            token += c;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '{' || c === '(' || c === '[' || c === '<') depth++;
        else if (c === '}' || c === ')' || c === ']' || c === '>') depth--;
        if (c === ',' && depth === 0) {
            out.push(token.trim());
            token = '';
            continue;
        }
        token += c;
    }
    if (token.trim()) out.push(token.trim());
    return out;
}

/** The index at which the balanced `(` opened at `open` closes, or -1. */
function closeOf(source, open, openChar = '(', closeChar = ')') {
    let depth = 0;
    let quote = null;
    for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (quote) {
            if (c === quote && source[i - 1] !== '\\') quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === openChar) depth++;
        else if (c === closeChar && --depth === 0) return i;
    }
    return -1;
}

/**
 * After a parameter list: the brace that opens the body, through a return
 * type when there is one. A `{` at angle-depth zero that follows `)`,
 * `>`, `}`, `]` or a word is the body; one after `:`, `|`, `&`, `,` or
 * `<` is an object type and is skipped whole. Anything that is not a type
 * (`;`, `.`, a second call) means this was a call, not a definition: -1.
 */
function bodyBraceAfter(source, from) {
    let i = from;
    while (i < source.length && /\s/.test(source[i])) i++;
    if (source[i] === '{') return i;
    if (source[i] !== ':') return -1;
    let angle = 0;
    let previous = ':';
    for (i++; i < source.length; i++) {
        const c = source[i];
        if (/\s/.test(c)) continue;
        if (c === '<') angle++;
        else if (c === '>') {
            if (angle === 0) return -1;
            angle--;
        } else if (c === '{') {
            if (angle === 0 && /[)>}\]\w]/.test(previous)) return i;
            const close = closeOf(source, i, '{', '}');
            if (close === -1) return -1;
            i = close;
            previous = '}';
            continue;
        } else if (c === '(') {
            const close = closeOf(source, i);
            if (close === -1) return -1;
            i = close;
            previous = ')';
            continue;
        } else if (!/[\w$.|&,'"\[\]]/.test(c)) return -1;
        previous = c;
    }
    return -1;
}

const NOT_A_FUNCTION = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'await', 'function', 'constructor', 'new', 'typeof', 'else', 'do', 'try', 'throw', 'yield', 'import', 'export', 'super', 'this']);

/**
 * Every function a backend file defines — `function name(...) {}`, a
 * method `name(...) {}` of an object or class, and `const name = (...) =>`
 * — with its body (or, for an expression-bodied arrow, the expression).
 */
export function extractFunctions(source) {
    const clean = withoutComments(source);
    const out = [];
    const seen = new Set();
    const add = (name, start, body, expression) => {
        const key = `${name}@${start}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ name, body, expression });
    };
    // 1. function declarations
    for (const match of clean.matchAll(/(?:^|[^\w.$])(?:export\s+)?(?:async\s+)?function\s*\*?\s+(\w+)\s*(?:<[^>]*>)?\s*\(/g)) {
        const open = match.index + match[0].length - 1;
        const close = closeOf(clean, open);
        if (close === -1) continue;
        const brace = bodyBraceAfter(clean, close + 1);
        if (brace === -1) continue;
        add(match[1], match.index, balanced(clean, brace).body, false);
    }
    // 2. methods at the start of a line
    for (const match of clean.matchAll(/(?:^|\n)[ \t]+(?:public\s+|private\s+|protected\s+|static\s+)*(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(/g)) {
        if (NOT_A_FUNCTION.has(match[1])) continue;
        const open = match.index + match[0].length - 1;
        const close = closeOf(clean, open);
        if (close === -1) continue;
        const brace = bodyBraceAfter(clean, close + 1);
        if (brace === -1) continue;
        add(match[1], match.index, balanced(clean, brace).body, false);
    }
    // 3. arrow constants
    for (const match of clean.matchAll(/(?:^|[^\w.$])(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]*?)?=\s*(?:async\s*)?(\(|\w+\s*=>)/g)) {
        let i;
        if (match[2] === '(') {
            const open = match.index + match[0].length - 1;
            const close = closeOf(clean, open);
            if (close === -1) continue;
            const arrow = clean.indexOf('=>', close);
            if (arrow === -1) continue;
            // Only an arrow right after the params (through a return type) is this constant's.
            const between = clean.slice(close + 1, arrow);
            if (/[;{]/.test(between.replace(/<[^>]*>/g, ''))) continue;
            i = arrow + 2;
        } else {
            i = match.index + match[0].length;
        }
        while (i < clean.length && /\s/.test(clean[i])) i++;
        if (clean[i] === '{') {
            add(match[1], match.index, balanced(clean, i).body, false);
            continue;
        }
        // An expression body runs to the `;` at depth zero, or to the end.
        let depth = 0;
        let quote = null;
        let end = i;
        for (; end < clean.length; end++) {
            const c = clean[end];
            if (quote) {
                if (c === quote && clean[end - 1] !== '\\') quote = null;
                continue;
            }
            if (c === '"' || c === "'" || c === '`') quote = c;
            else if (c === '{' || c === '(' || c === '[') depth++;
            else if (c === '}' || c === ')' || c === ']') {
                if (depth === 0) break;
                depth--;
            } else if ((c === ';' || c === ',') && depth === 0) break;
        }
        add(match[1], match.index, clean.slice(i, end), true);
    }
    return out;
}

/** `const name = { ... }` object constants of a file, as their literal bodies — `select: matchSelect` resolves through these. */
function objectConstantsOf(source) {
    const clean = withoutComments(source);
    const out = new Map();
    for (const match of clean.matchAll(/(?:^|[^\w.$])(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]*?)?=\s*\{/g)) {
        out.set(match[1], balanced(clean, match.index + match[0].length - 1).body);
    }
    return out;
}

/** `a/b/../c` -> `a/c`. */
function normalisePosix(path) {
    const out = [];
    for (const part of path.split('/')) {
        if (part === '..') out.pop();
        else if (part && part !== '.') out.push(part);
    }
    return out.join('/');
}

/**
 * What a backend file imports, by local name: the files each binding
 * resolves to — one file for `./x.service`, every file below a directory
 * for `../users` (its `index.ts` re-exports the module). A namespace
 * import (`* as repository`) and a default import resolve the same way.
 */
function importsOf(source, file, files) {
    const clean = withoutComments(source);
    const dir = file.split('/').slice(0, -1).join('/');
    const out = new Map();
    const resolve = (spec) => {
        if (!spec.startsWith('.')) return [];
        const target = normalisePosix(`${dir}/${spec}`);
        if (files[`${target}.ts`]) return [`${target}.ts`];
        return Object.keys(files).filter((candidate) => candidate.startsWith(`${target}/`));
    };
    const pattern = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\*\s+as\s+(\w+)|\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;
    for (const match of clean.matchAll(pattern)) {
        const targets = resolve(match[4]);
        if (targets.length === 0) continue;
        if (match[1]) out.set(match[1], targets);
        if (match[2]) out.set(match[2], targets);
        for (const raw of (match[3] ?? '').split(',')) {
            const binding = raw.trim().replace(/^type\s+/, '');
            if (!binding) continue;
            const [, local] = binding.match(/^\w+\s+as\s+(\w+)$/) ?? [null, binding];
            if (/^\w+$/.test(local)) out.set(local, targets);
        }
    }
    return out;
}

/**
 * The backend, indexed once: `files` is `{ 'modules/<module>/.../x.ts': source }`
 * (and `shared/<area>/...` for the helpers modules import). Functions by
 * name (each with its file and module), object constants and imports by
 * file, and the Prisma models.
 */
/**
 * `apiRouter.use('/pricing', pricingRouter)` + `import { pricingRouter } from '../modules/pricing'`
 * in the bootstrap: which module answers under which mount. A router used
 * with no mount (`apiRouter.use(suspensionRouter)`) answers under `/`.
 */
export function mountsOf(bootstrap) {
    if (!bootstrap) return [];
    const clean = withoutComments(bootstrap);
    const moduleOf = new Map();
    for (const match of clean.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\.\/modules\/([\w-]+)(?:\/[\w./-]+)?['"]/g)) {
        for (const raw of match[1].split(',')) {
            const binding = raw.trim().split(/\s+as\s+/).pop();
            if (binding) moduleOf.set(binding, `modules/${match[2]}`);
        }
    }
    const mounts = [];
    for (const match of clean.matchAll(/apiRouter\.use\(\s*(?:['"]([^'"]*)['"]\s*,\s*)?(\w+)\s*\)/g)) {
        const moduleName = moduleOf.get(match[2]);
        if (moduleName) mounts.push({ mount: match[1] ?? '/', module: moduleName });
    }
    return mounts;
}

/** The modules mounted under the longest prefix of `path` (without the API prefix): `/pricing/cities` -> the `/pricing` routers' modules. */
function modulesFor(mounts, path) {
    let best = [];
    let length = -1;
    for (const { mount, module } of mounts) {
        const prefix = mount === '/' ? '' : mount;
        if (!(path === prefix || path.startsWith(`${prefix}/`)) || prefix.length < length) continue;
        if (prefix.length > length) {
            best = [];
            length = prefix.length;
        }
        best.push(module);
    }
    return [...new Set(best)];
}

export function indexBackend(files, models) {
    const functions = new Map();
    const constants = new Map();
    const imports = new Map();
    const byFile = new Map();
    const mounts = mountsOf(files['bootstrap/register-modules.ts']);
    for (const [file, source] of Object.entries(files)) {
        const moduleName = file.split('/').slice(0, 2).join('/');
        const own = [];
        for (const fn of extractFunctions(source)) {
            const entry = { ...fn, file, module: moduleName };
            own.push(entry);
            const list = functions.get(fn.name) ?? [];
            list.push(entry);
            functions.set(fn.name, list);
        }
        byFile.set(file, own);
        constants.set(file, objectConstantsOf(source));
        imports.set(file, importsOf(source, file, files));
    }
    return { files, functions, byFile, constants, imports, models, mounts };
}

const SHAPE_DEPTH = 8;
const NOT_TRACED = new Set(['Promise', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Math', 'Date', 'Map', 'Set', 'Symbol', 'Error', 'Buffer', 'parseInt', 'parseFloat']);
const PRISMA_ROW_OPS = new Set(['findMany', 'findUnique', 'findFirst', 'findUniqueOrThrow', 'findFirstOrThrow', 'create', 'update', 'upsert', 'delete']);

const modelNameOf = (accessor) => accessor[0].toUpperCase() + accessor.slice(1);

/** What a `return null` / `return;` / a literal answers: no object, and nothing unknown. */
const NONE = Object.freeze({ fields: [], open: false, none: true });

/**
 * Unions shapes; open when any is. A branch the trace could not follow
 * (null) makes the whole unknown — a shape missing one branch would fail
 * a field that branch carries. Literal answers (NONE) are left out.
 */
function combine(shapes) {
    if (shapes.some((shape) => shape === null || shape === undefined)) return null;
    const found = shapes.filter((shape) => !shape.none);
    if (found.length === 0) return NONE;
    return { fields: [...new Set(found.flatMap((s) => s.fields))], open: found.some((s) => s.open) };
}

/** Strips `await`, wrapping parens, `as X` / `satisfies X` and a trailing `!`. */
function unwrap(expression) {
    let e = expression.trim();
    for (;;) {
        const before = e;
        e = e.replace(/^await\s+/, '').replace(/\s+(?:as|satisfies)\s+[\w.<>\[\]|&\s'"]+$/, '').replace(/!$/, '').trim();
        if (e.startsWith('(') && closeOf(e, 0) === e.length - 1) e = e.slice(1, -1).trim();
        if (e === before) return e;
    }
}

/** The `select`/`include` value as an object body: a literal, or a constant of the same file. */
function objectBodyOf(value, index, file) {
    const v = unwrap(value);
    if (v.startsWith('{')) return balanced(v, 0).body;
    const constant = index.constants.get(file)?.get(v);
    return constant ?? null;
}

/** The keys of a `select` — a literal, a constant of the file, or a literal spreading one (`{ ...matchSelect, kyc: ... }`). */
function selectShape(value, index, file, depth = 0) {
    const body = objectBodyOf(value, index, file);
    if (body === null || depth > 4) return { fields: [], open: true };
    const entries = topLevelEntries(body);
    const fields = entries.filter((entry) => entry.key).map((entry) => entry.key);
    let open = false;
    for (const entry of entries.filter((entry) => entry.spread)) {
        const spread = selectShape(entry.value, index, file, depth + 1);
        fields.push(...spread.fields);
        open = open || spread.open;
    }
    return { fields: [...new Set(fields)], open };
}

/** What a Prisma row call answers with: the `select` keys, or the model's scalar fields plus `include`. */
function prismaShape(accessor, op, argsText, index, file) {
    if (!PRISMA_ROW_OPS.has(op)) return null;
    const model = index.models.get(modelNameOf(accessor));
    const args = argsText.trim().startsWith('{') ? topLevelEntries(balanced(argsText.trim(), 0).body) : [];
    const select = args.find((entry) => entry.key === 'select');
    if (select) return selectShape(select.value, index, file);
    if (!model) return null;
    const fields = [...model.keys()];
    const include = args.find((entry) => entry.key === 'include');
    if (include) {
        const body = objectBodyOf(include.value, index, file);
        if (body === null) return { fields, open: true };
        const entries = topLevelEntries(body);
        return { fields: [...fields, ...entries.filter((entry) => entry.key).map((entry) => entry.key)], open: entries.some((entry) => entry.spread) };
    }
    if (args.find((entry) => entry.key === 'omit')) return { fields, open: true };
    return { fields, open: false };
}

/** `const <name> = <expression>` / `let <name> = ...` in a body — the expression the identifier stands for. */
function assignmentOf(body, name) {
    const match = body.match(new RegExp(`(?:^|[^\\w.$])(?:const|let|var)\\s+${name}\\s*(?::\\s*[^=]*?)?=\\s*`));
    if (!match) return null;
    const start = match.index + match[0].length;
    let depth = 0;
    let quote = null;
    let end = start;
    for (; end < body.length; end++) {
        const c = body[end];
        if (quote) {
            if (c === quote && body[end - 1] !== '\\') quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '{' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === ')' || c === ']') {
            if (depth === 0) break;
            depth--;
        } else if (c === ';' && depth === 0) break;
    }
    return body.slice(start, end).trim();
}

/** The depth-zero positions of `operator` in `expression`, quotes and brackets honoured. */
function positionsAtDepthZero(expression, operator) {
    const out = [];
    let depth = 0;
    let quote = null;
    for (let i = 0; i < expression.length; i++) {
        const c = expression[i];
        if (quote) {
            if (c === quote && expression[i - 1] !== '\\') quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '{' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === ')' || c === ']') depth--;
        else if (depth === 0 && expression.startsWith(operator, i)) {
            out.push(i);
            i += operator.length - 1;
        }
    }
    return out;
}

/** Splits an expression at every depth-zero occurrence of any of `operators` (`??`, `||`). */
function splitAtDepthZero(expression, operators) {
    const cuts = operators.flatMap((op) => positionsAtDepthZero(expression, op).map((at) => ({ at, length: op.length }))).sort((a, b) => a.at - b.at);
    const parts = [];
    let from = 0;
    for (const cut of cuts) {
        if (cut.at < from) continue;
        parts.push(expression.slice(from, cut.at));
        from = cut.at + cut.length;
    }
    parts.push(expression.slice(from));
    return parts;
}

/** `cond ? a : b` at depth zero — `[a, b]` — or null; `?.` and `??` are not ternaries. */
function ternaryBranches(expression) {
    const question = positionsAtDepthZero(expression, '?').find((at) => expression[at + 1] !== '.' && expression[at + 1] !== '?' && expression[at - 1] !== '?');
    if (question === undefined) return null;
    const rest = expression.slice(question + 1);
    const colon = positionsAtDepthZero(rest, ':')[0];
    if (colon === undefined) return null;
    return [rest.slice(0, colon), rest.slice(colon + 1)];
}

/**
 * The shape an expression evaluates to, followed through the module: an
 * object literal, `rows.map(...)`, a Prisma call, a ternary, a local
 * constant, or a call into a function the index knows. Null when it
 * cannot say.
 */
function shapeOfExpression(expression, ctx, depth) {
    if (depth > SHAPE_DEPTH) return null;
    const e = unwrap(expression);
    if (!e || /^(null|undefined|true|false|void 0|\d+|'[^']*'|"[^"]*"|`[^`]*`)$/.test(e)) return NONE;

    // A ternary, `??` or `||`: every branch may answer.
    const branches = ternaryBranches(e);
    if (branches) return combine(branches.map((branch) => shapeOfExpression(branch, ctx, depth + 1)));
    const coalesce = splitAtDepthZero(e, ['??', '||']);
    if (coalesce.length > 1) return combine(coalesce.map((part) => shapeOfExpression(part, ctx, depth + 1)));

    // An object literal; a `...spread` contributes what it resolves to, or opens the shape.
    if (e.startsWith('{')) {
        const entries = topLevelEntries(balanced(e, 0).body);
        const own = { fields: entries.filter((entry) => entry.key).map((entry) => entry.key), open: false };
        const spreads = entries.filter((entry) => entry.spread).map((entry) => shapeOfExpression(entry.value, ctx, depth + 1));
        if (spreads.some((shape) => !shape || shape.none)) return { ...own, open: true };
        return combine([own, ...spreads]);
    }

    // `rows.map(toView)` / `rows.map((row) => ({ ... }))` / `.map((row) => { return {...} })`.
    const map = e.match(/\.map\(\s*$/) ? null : e.match(/\.map\(/);
    if (map && closeOf(e, map.index + map[0].length - 1) === e.length - 1) {
        const inner = e.slice(map.index + map[0].length, -1).trim();
        if (/^\w+$/.test(inner)) return shapeOfCall(inner, null, ctx, depth + 1);
        const arrow = inner.match(/^(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::\s*[^=]+?)?=>\s*/);
        if (arrow) {
            const rest = inner.slice(arrow[0].length).trim();
            if (rest.startsWith('{')) {
                const body = balanced(rest, 0).body;
                // A block body returns; an object body is `({ ... })`, unwrapped above.
                return /(^|[^\w$])return\b/.test(body) ? shapeOfBody(body, ctx, depth + 1) : shapeOfExpression(rest, ctx, depth + 1);
            }
            return shapeOfExpression(rest, ctx, depth + 1);
        }
        return null;
    }

    // A Prisma row call — `prisma.city.findMany({...})`, `tx.publisher.findUnique(...)`.
    const prisma = e.match(/^(?:this\.)?(?:prisma|tx|db|client)\.(\w+)\.(\w+)\(/);
    if (prisma && closeOf(e, prisma[0].length - 1) === e.length - 1) {
        return prismaShape(prisma[1], prisma[2], e.slice(prisma[0].length, -1), ctx.index, ctx.file);
    }

    // A call: `name(...)`, `repository.name(...)` — followed by name, through the file's imports.
    const call = e.match(/^([\w$.]+)\(/);
    if (call && closeOf(e, call[0].length - 1) === e.length - 1) {
        const parts = call[1].split('.');
        const name = parts.pop();
        if (NOT_TRACED.has(parts[0]) || NOT_TRACED.has(name)) return null;
        return shapeOfCall(name, parts[0] ?? null, ctx, depth + 1);
    }

    // An identifier: what the body assigned to it.
    if (/^[\w$]+$/.test(e) && ctx.body) {
        const assigned = assignmentOf(ctx.body, e);
        if (assigned === null) return null;
        return shapeOfExpression(assigned, ctx, depth + 1);
    }
    return null;
}

/** The shapes a function body returns — every `return` at paren-depth zero, or the expression itself. */
function shapeOfBody(body, ctx, depth) {
    if (depth > SHAPE_DEPTH) return null;
    const scoped = { ...ctx, body };
    const shapes = [];
    let parens = 0;
    let quote = null;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (quote) {
            if (c === quote && body[i - 1] !== '\\') quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            continue;
        }
        if (c === '(' || c === '[') parens++;
        else if (c === ')' || c === ']') parens--;
        if (parens !== 0 || !body.startsWith('return', i) || (i > 0 && /[\w$.]/.test(body[i - 1])) || /[\w$]/.test(body[i + 6] ?? ' ')) continue;
        // The expression runs to `;` at depth zero or to the block's end.
        let d = 0;
        let q = null;
        let end = i + 6;
        for (; end < body.length; end++) {
            const ch = body[end];
            if (q) {
                if (ch === q && body[end - 1] !== '\\') q = null;
                continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') q = ch;
            else if (ch === '{' || ch === '(' || ch === '[') d++;
            else if (ch === '}' || ch === ')' || ch === ']') {
                if (d === 0) break;
                d--;
            } else if (ch === ';' && d === 0) break;
        }
        shapes.push(shapeOfExpression(body.slice(i + 6, end), scoped, depth + 1));
        i = end;
    }
    return combine(shapes);
}

/**
 * The shape a named function answers with. Where it is looked for, in
 * order: the file the qualifier (`repository.` in `repository.find()`) or
 * the name itself is imported from; the current file; the current module.
 * A name found nowhere — or in none of those — is unknown. Results are
 * memoised per definition; a cycle answers NONE.
 */
function shapeOfCall(name, qualifier, ctx, depth) {
    if (depth > SHAPE_DEPTH) return null;
    const imports = ctx.index.imports.get(ctx.file) ?? new Map();
    const imported = (qualifier && imports.get(qualifier)) || imports.get(name) || null;
    const all = ctx.index.functions.get(name) ?? [];
    let candidates = [];
    if (imported) candidates = all.filter((fn) => imported.includes(fn.file));
    if (candidates.length === 0 && !imported) candidates = all.filter((fn) => fn.file === ctx.file);
    if (candidates.length === 0 && !imported) candidates = all.filter((fn) => fn.module === ctx.module);
    if (candidates.length === 0) return null;
    const shapes = [];
    for (const fn of candidates) {
        const key = `${fn.file}#${fn.name}#${fn.body.length}`;
        if (ctx.memo.has(key)) {
            const known = ctx.memo.get(key);
            shapes.push(known === 'tracing' ? NONE : known);
            continue;
        }
        ctx.memo.set(key, 'tracing');
        const scoped = { ...ctx, file: fn.file, module: fn.module };
        const shape = fn.expression ? shapeOfExpression(fn.body, { ...scoped, body: null }, depth + 1) : shapeOfBody(fn.body, scoped, depth + 1);
        ctx.memo.set(key, shape);
        shapes.push(shape);
    }
    return combine(shapes);
}

/** The expressions a handler answers with: `data` of `res[.status(n)].json({ success, data })`, the second argument of `ok(res, x)` / `respond(res, x)`. */
function responseExpressionsOf(body) {
    const out = [];
    for (const match of body.matchAll(/\bres(?:\.status\(\d+\))?\.json\(/g)) {
        const open = match.index + match[0].length - 1;
        const close = closeOf(body, open);
        if (close === -1) continue;
        const argument = body.slice(open + 1, close).trim();
        if (argument.startsWith('{')) {
            const data = topLevelEntries(balanced(argument, 0).body).find((entry) => entry.key === 'data');
            if (data) out.push(data.value);
        } else out.push(argument);
    }
    for (const match of body.matchAll(/(?:^|[^\w.$])(\w+)\(\s*res\s*,/g)) {
        const open = match.index + match[0].indexOf('(');
        const close = closeOf(body, open);
        if (close === -1) continue;
        const [, data] = splitArguments(body.slice(open + 1, close));
        if (data) out.push(data);
    }
    return out;
}

/**
 * The shape `method path` answers with, from the backend index: the
 * inventory row's own `response.fields` when it carries them, else the
 * handler traced. `{ fields, open }` or `{ unverifiable: reason }`.
 */
export function responseShapeOf(route, index) {
    const declared = Array.isArray(route.response) ? route.response : route.response?.fields;
    if (Array.isArray(declared)) return { fields: declared, open: false, source: 'inventory' };
    const handler = (route.chain ?? [])[route.chain?.length - 1];
    if (!handler || !/^\w+$/.test(handler)) return { unverifiable: 'the route ends in an anonymous handler' };
    const defined = (index.functions.get(handler) ?? []).filter((fn) => /\.controller\.ts$/.test(fn.file));
    const path = route.path.replace(new RegExp(`^${API_PREFIX}`), '');
    const modules = modulesFor(index.mounts, path);
    const fallback = `modules/${path.split('/')[1]}`;
    let candidates = defined;
    if (candidates.length > 1) candidates = defined.filter((fn) => modules.includes(fn.module));
    if (candidates.length === 0) candidates = defined.filter((fn) => fn.module === fallback);
    if (candidates.length === 0) return { unverifiable: defined.length === 0 ? `no controller defines ${handler}` : `${handler} is defined in ${defined.length} controllers and none is mounted under ${path}` };
    if (candidates.length > 1) return { unverifiable: `${handler} is defined ${candidates.length} times among the modules mounted under ${path}` };
    const [fn] = candidates;
    const expressions = responseExpressionsOf(fn.body);
    if (expressions.length === 0) return { unverifiable: `${handler} answers with no JSON data the script can read` };
    const ctx = { index, file: fn.file, module: fn.module, body: fn.body, memo: new Map() };
    const shape = combine(expressions.map((expression) => shapeOfExpression(expression, ctx, 0)));
    if (!shape) return { unverifiable: `${handler}: a branch of the response could not be followed to a select, mapper or object literal` };
    if (shape.none) return { unverifiable: `${handler}: the response is not an object` };
    if (shape.open) return { unverifiable: `${handler}: the response is built with a spread or an unresolved select/include` };
    return { ...shape, source: handler };
}

const UTILITY_TYPES = new Set(['Partial', 'Pick', 'Omit', 'Record', 'Array', 'Promise', 'Readonly', 'Required', 'Exclude', 'Extract', 'NonNullable', 'ReturnType']);

/**
 * The required fields a call's generic claims — resolved through `lookup(name)`
 * for a named interface. `City`, `City[]`, `City | null` are `City`;
 * `Paged<City>` is `Paged` (the wrapper's own fields); `{ a: string }` is
 * the inline type; `A & { b: string }` is both sides together. `unknown`
 * claims nothing (`skip`); a utility type, a union or a bare parameter
 * cannot be read here (`unverifiable`).
 */
export function genericClaim(generic, lookup) {
    if (!generic) return { unverifiable: 'the call names no response type' };
    const trimmed = generic.replace(/\s*\|\s*(null|undefined)\b/g, '').replace(/^\((.*)\)$/s, '$1').trim();
    if (/^(unknown|any|void|never)$/.test(trimmed)) return { skip: `the generic \`${trimmed}\` claims nothing` };
    const parts = splitAtDepthZero(trimmed, ['&']).map((part) => part.trim());
    const fields = [];
    let name = null;
    for (const part of parts) {
        const bare = part.replace(/\[\]$/, '').trim();
        if (bare.startsWith('{')) {
            const { fields: own, open } = fieldsOfTypeBody(balanced(bare, 0).body);
            if (open) return { unverifiable: `the generic \`${generic}\` is open (an index signature)` };
            fields.push(...own);
            name ??= bare.length > 40 ? `${bare.slice(0, 37)}...}` : bare;
            continue;
        }
        const named = bare.match(/^([A-Z]\w*)(?:<.*>)?$/s);
        if (!named || named[1].length < 2) return { unverifiable: `the generic \`${generic}\` names no interface` };
        if (UTILITY_TYPES.has(named[1])) return { unverifiable: `the generic \`${generic}\` is a utility type the script cannot read` };
        const iface = lookup(named[1]);
        if (!iface) return { unverifiable: `${named[1]} is not an interface declared by the service or one it imports` };
        if (iface.open) return { unverifiable: `${named[1]} is open (an index signature, a utility type, an intersection or an unresolved parent)` };
        fields.push(...iface.fields);
        name ??= named[1];
    }
    return { name, fields };
}

/**
 * Every interface across the console's service and type files, resolved
 * by `(file, name)`: declared in the file, or imported from a sibling
 * service (`./x`, `@/services/x`), a types file (`@/types/x`) or the
 * types index (`@/types`, which re-exports every types file). Parents are
 * folded in; an unresolved parent opens the interface.
 */
function interfacesByFile(files) {
    const byFile = new Map();
    for (const [file, source] of Object.entries(files)) byFile.set(file, new Map(extractInterfaces(source).map((iface) => [iface.name, iface])));
    const typeFiles = Object.keys(files).filter((file) => file.startsWith('types/') && file !== 'types/index.ts');
    const targetsOf = (spec) => {
        if (spec.startsWith('./')) return [`services/${spec.slice(2)}.ts`, `types/${spec.slice(2)}.ts`];
        if (spec.startsWith('@/services/')) return [`services/${spec.slice('@/services/'.length)}.ts`];
        if (spec === '@/types' || spec === '@/types/index') return typeFiles;
        if (spec.startsWith('@/types/')) return [`types/${spec.slice('@/types/'.length)}.ts`];
        return [];
    };
    const resolve = (file, name, seen = new Set()) => {
        const iface = byFile.get(file)?.get(name);
        if (!iface) {
            const source = files[file];
            if (!source) return null;
            const imported = [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g)].find((m) => new RegExp(`(?:^|[\\s,])(?:type\\s+)?${name}(?:\\s*,|\\s*$)`).test(m[1].trim()));
            if (!imported) return null;
            for (const target of targetsOf(imported[2])) {
                if (target === file || !byFile.has(target)) continue;
                const found = resolve(target, name, seen);
                if (found) return found;
            }
            return null;
        }
        if (seen.has(`${file}:${name}`)) return iface;
        seen.add(`${file}:${name}`);
        let fields = [...iface.fields];
        let open = iface.open;
        for (const parent of iface.parents) {
            const resolved = resolve(file, parent, seen);
            if (!resolved) open = true;
            else {
                fields = [...resolved.fields.filter((f) => !fields.some((own) => own.name === f.name)), ...fields];
                open = open || resolved.open;
            }
        }
        return { ...iface, fields, open };
    };
    return resolve;
}

/**
 * (e) — `services` is `{ 'services/x.ts': source }`, `routes` the
 * inventory, `backend` the index from `indexBackend`. A required field of
 * the named interface that the response's shape lacks is a problem; a
 * call whose response cannot be traced is listed as unverifiable.
 */
export function auditResponses(services, routes, backend, types = {}) {
    const problems = [];
    const unverifiable = [];
    let checked = 0;
    let fields = 0;
    let skipped = 0;
    const resolveInterface = interfacesByFile({ ...services, ...types });
    const shapes = new Map();
    for (const [file, source] of Object.entries(services)) {
        for (const call of extractCalls(source)) {
            if (call.unresolved !== undefined || !['get', 'post', 'patch', 'put'].includes(call.verb)) continue;
            const route = routeFor(routes, call.method, API_PREFIX + call.path);
            if (!route) continue; // (a) reports it
            const where = `${file}:${call.line}: ${call.method} ${call.path}`;
            const target = genericClaim(call.generic, (name) => resolveInterface(file, name));
            if (target.skip) {
                skipped++;
                continue;
            }
            if (target.unverifiable) {
                unverifiable.push(`${where} — ${target.unverifiable}`);
                continue;
            }
            const iface = target;
            const key = `${route.method} ${route.path}`;
            if (!shapes.has(key)) shapes.set(key, responseShapeOf(route, backend));
            const shape = shapes.get(key);
            if (shape.unverifiable) {
                unverifiable.push(`${where} — ${shape.unverifiable}`);
                continue;
            }
            checked++;
            const required = iface.fields.filter((field) => !field.optional);
            fields += required.length;
            const missing = required.filter((field) => !shape.fields.includes(field.name)).map((field) => field.name);
            if (missing.length > 0) {
                problems.push(`${where} answers ${target.name}, but the backend's response (${shape.source}) never carries [${missing.join(', ')}] — drop the field${missing.length === 1 ? '' : 's'} or make ${missing.length === 1 ? 'it' : 'them'} optional`);
            }
        }
    }
    return { problems, unverifiable, checked, fields, skipped };
}

/**
 * All five, with the known debt separated out: `problems` fails the check,
 * `debt` is printed. A debt entry that no longer reproduces is a problem.
 * `backend` is `{ 'modules/<module>/x.ts': source }` for (e); without it
 * the response audit is skipped and says so in its counts.
 * @param {{ services: Record<string, string>; types: Record<string, string>; routes: { method: string; path: string; chain?: string[]; response?: string[] | { fields: string[] } }[]; schema: string; backend?: Record<string, string>; registry?: Record<string, string>; allowed?: string[]; knownDebt?: string[] }} input
 */
export function checkContract({ services, types, routes, schema, backend, registry = REGISTRY, allowed = ALLOWED_UNIONS, knownDebt = KNOWN_DEBT }) {
    const enums = parseEnums(schema);
    const models = parseModels(schema);
    const both = { ...services, ...types };
    const results = {
        routes: auditRoutes(services, routes),
        enums: auditEnums(both, enums, registry),
        unions: auditUnions(types, enums, allowed),
        nullability: auditNullability(services, models),
        responses: backend ? auditResponses(services, routes, indexBackend(backend, models), types) : { problems: [], unverifiable: [], checked: 0, fields: 0, skipped: 0, absent: true },
    };
    const found = Object.values(results).flatMap((r) => r.problems);
    const withoutLine = (line) => line.replace(/^([^:\s]+):\d+:/, '$1:');
    const isDebt = (problem) => knownDebt.some((entry) => entry === problem || withoutLine(entry) === withoutLine(problem));
    const debt = found.filter(isDebt);
    const problems = found.filter((p) => !isDebt(p));
    for (const entry of knownDebt) {
        if (!found.some((problem) => problem === entry || withoutLine(problem) === withoutLine(entry))) {
            problems.push(`known debt no longer reproduces — remove it from KNOWN_DEBT: ${entry}`);
        }
    }
    return { problems, debt, results };
}

/* ------------------------------------------------------------------ */
/* The walk                                                            */
/* ------------------------------------------------------------------ */

/** `{ '<prefix>/<file>.ts': source }` for every non-test .ts file directly under `dir`. */
export function sourcesUnder(dir, prefix) {
    const out = {};
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts') || entry.name.endsWith('.d.ts')) continue;
        out[`${prefix}/${entry.name}`] = readFileSync(join(dir, entry.name), 'utf8');
    }
    return out;
}

/** `{ '<prefix>/<path>.ts': source }` for every non-test .ts file anywhere below `dir`, `__tests__` left out. */
export function sourcesBelow(dir, prefix) {
    const out = {};
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (entry.name === '__tests__') continue;
            Object.assign(out, sourcesBelow(join(dir, entry.name), `${prefix}/${entry.name}`));
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts') || entry.name.endsWith('.d.ts')) continue;
        out[`${prefix}/${entry.name}`] = readFileSync(join(dir, entry.name), 'utf8');
    }
    return out;
}

export function main() {
    const base = root();
    const inventoryFile = join(base, INVENTORY_PATH);
    const schemaFile = join(base, SCHEMA_PATH);
    for (const [what, file] of [['route inventory', inventoryFile], ['Prisma schema', schemaFile]]) {
        if (!existsSync(file)) {
            console.error(`check-contract: the backend's ${what} is not at ${relative(base, file).split(sep).join('/')} — the console checks its contract against the sibling ADX-backendv1 package; clone it beside this one (and run its \`npm run routes:inventory\` if the file is missing there).`);
            process.exit(1);
        }
    }
    const routes = JSON.parse(readFileSync(inventoryFile, 'utf8')).routes;
    const schema = readFileSync(schemaFile, 'utf8');
    const services = sourcesUnder(join(base, 'src', 'services'), 'services');
    const types = sourcesUnder(join(base, 'src', 'types'), 'types');
    const backend = {
        ...sourcesBelow(join(base, BACKEND_DIR, 'src', 'modules'), 'modules'),
        ...sourcesBelow(join(base, BACKEND_DIR, 'src', 'shared'), 'shared'),
        ...sourcesBelow(join(base, BACKEND_DIR, 'src', 'bootstrap'), 'bootstrap'),
    };

    const { problems, debt, results } = checkContract({ services, types, routes, schema, backend });
    for (const entry of debt) console.warn(`check-contract: known debt — ${entry}`);
    const verbose = process.argv.includes('--verbose');
    if (verbose) for (const entry of results.responses.unverifiable) console.warn(`check-contract: unverifiable — ${entry}`);
    if (problems.length > 0) {
        console.error(`check-contract: ${problems.length} problem(s)`);
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
    console.log(
        `check-contract: ${results.routes.checked} calls against ${routes.length} routes (${results.routes.skipped} dynamic paths skipped), ` +
            `${results.enums.checked} enum records, ${results.unions.checked} lowercase unions, ` +
            `${results.nullability.checked} wire fields (${results.nullability.ambiguous} ambiguous by name), ` +
            `${results.responses.checked} responses (${results.responses.fields} required fields) traced to the backend, ${results.responses.skipped} claiming nothing, ${results.responses.unverifiable.length} unverifiable${verbose ? '' : ' (--verbose lists them)'}` +
            `, ${debt.length} known debt(s)` +
            ' — contract holds.'
    );
}

// Run only as a script; the test imports the audits without walking the tree.
if (import.meta.url.startsWith('file:') && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
