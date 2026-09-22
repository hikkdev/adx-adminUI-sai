"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/adx/section-card";
import { SETTING_BOUNDS, changedKeys, parseBounded, parseBoundedDecimal, settingsService, type LeadClaimsPolicy, type LeadPriorityPolicy, type LeadScoringPolicy } from "@/services/settings";
import { SOURCE_KIND_LABEL, leadsService, type LeadSource } from "@/services/leads";

interface LeadsScoringViewProps {
    /** `settings.leads.scoring`: null when the backend did not serve the section. */
    policy: LeadScoringPolicy | null;
    /** LH5: the rest of `settings.leads` — the claims (D3), the referral credit (D9), the priority top-up (D7). */
    hunt: HuntPolicy | null;
    sources: LeadSource[];
    live: boolean;
    onSaved: () => void;
}

interface CategoryRow {
    key: string;
    points: string;
}

interface Draft {
    fitMax: string;
    intentMax: string;
    recencyMin: string;
    sourceMax: string;
    agentFlag: string;
    afterDays7: string;
    afterDays21: string;
    afterDays45: string;
    hot: string;
    warm: string;
    agentFlagDays: string;
    intent: Record<string, string>;
    defaultCategory: string;
    publisherCategories: CategoryRow[];
    advertiserCategories: CategoryRow[];
    keyBonus: string;
    enterpriseBonus: string;
    localityBonus: string;
    localityRadiusM: string;
}

const rows = (table: Record<string, number>): CategoryRow[] =>
    Object.entries(table)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, points]) => ({ key, points: String(points) }));

const toDraft = (policy: LeadScoringPolicy): Draft => ({
    fitMax: String(policy.weights.fitMax),
    intentMax: String(policy.weights.intentMax),
    recencyMin: String(policy.weights.recencyMin),
    sourceMax: String(policy.weights.sourceMax),
    agentFlag: String(policy.weights.agentFlag),
    afterDays7: String(policy.recency.afterDays7),
    afterDays21: String(policy.recency.afterDays21),
    afterDays45: String(policy.recency.afterDays45),
    hot: String(policy.thresholds.hot),
    warm: String(policy.thresholds.warm),
    agentFlagDays: String(policy.agentFlagDays),
    intent: Object.fromEntries(Object.entries(policy.intent).map(([key, value]) => [key, String(value)])),
    defaultCategory: String(policy.fit.defaultCategory),
    publisherCategories: rows(policy.fit.categoryBySide.PUBLISHER),
    advertiserCategories: rows(policy.fit.categoryBySide.ADVERTISER),
    keyBonus: String(policy.fit.importanceBonus.KEY),
    enterpriseBonus: String(policy.fit.importanceBonus.ENTERPRISE),
    localityBonus: String(policy.fit.localityBonus),
    localityRadiusM: String(policy.fit.localityRadiusM),
});

/** A negative-or-zero whole number inside bounds, or null — the recency figures. */
function parseNegative(text: string, bounds: { min: number; max: number }): number | null {
    const trimmed = text.trim().replace("−", "-");
    if (!/^-?\d+$/.test(trimmed)) return null;
    const value = Number(trimmed);
    return value >= bounds.min && value <= bounds.max ? value : null;
}

function table(list: CategoryRow[]): Record<string, number> | null {
    const out: Record<string, number> = {};
    for (const row of list) {
        const key = row.key.trim().toLowerCase();
        const points = parseBounded(row.points, SETTING_BOUNDS["leads.scoring.fit.points"]);
        if (!key || points === null || key in out) return null;
        out[key] = points;
    }
    return out;
}

/** The draft as the policy, or null while a number is outside what the schema takes (or warm is not below hot). */
export function fromDraft(draft: Draft): LeadScoringPolicy | null {
    const fitMax = parseBounded(draft.fitMax, SETTING_BOUNDS["leads.scoring.weights.fitMax"]);
    const intentMax = parseBounded(draft.intentMax, SETTING_BOUNDS["leads.scoring.weights.intentMax"]);
    const recencyMin = parseNegative(draft.recencyMin, SETTING_BOUNDS["leads.scoring.weights.recencyMin"]);
    const sourceMax = parseBounded(draft.sourceMax, SETTING_BOUNDS["leads.scoring.weights.sourceMax"]);
    const agentFlag = parseBounded(draft.agentFlag, SETTING_BOUNDS["leads.scoring.weights.agentFlag"]);
    const afterDays7 = parseNegative(draft.afterDays7, SETTING_BOUNDS["leads.scoring.recency"]);
    const afterDays21 = parseNegative(draft.afterDays21, SETTING_BOUNDS["leads.scoring.recency"]);
    const afterDays45 = parseNegative(draft.afterDays45, SETTING_BOUNDS["leads.scoring.recency"]);
    const hot = parseBounded(draft.hot, SETTING_BOUNDS["leads.scoring.thresholds.hot"]);
    const warm = parseBounded(draft.warm, SETTING_BOUNDS["leads.scoring.thresholds.warm"]);
    const agentFlagDays = parseBounded(draft.agentFlagDays, SETTING_BOUNDS["leads.scoring.agentFlagDays"]);
    const defaultCategory = parseBounded(draft.defaultCategory, SETTING_BOUNDS["leads.scoring.fit.points"]);
    const keyBonus = parseBounded(draft.keyBonus, SETTING_BOUNDS["leads.scoring.fit.points"]);
    const enterpriseBonus = parseBounded(draft.enterpriseBonus, SETTING_BOUNDS["leads.scoring.fit.points"]);
    const localityBonus = parseBounded(draft.localityBonus, SETTING_BOUNDS["leads.scoring.fit.points"]);
    const localityRadiusM = parseBounded(draft.localityRadiusM, SETTING_BOUNDS["leads.scoring.fit.localityRadiusM"]);
    const numbers = [fitMax, intentMax, recencyMin, sourceMax, agentFlag, afterDays7, afterDays21, afterDays45, hot, warm, agentFlagDays, defaultCategory, keyBonus, enterpriseBonus, localityBonus, localityRadiusM];
    if (numbers.some((value) => value === null)) return null;
    if ((warm as number) >= (hot as number)) return null;
    const intent: Record<string, number> = {};
    for (const [key, text] of Object.entries(draft.intent)) {
        const value = parseBounded(text, SETTING_BOUNDS["leads.scoring.intent"]);
        if (value === null) return null;
        intent[key] = value;
    }
    const PUBLISHER = table(draft.publisherCategories);
    const ADVERTISER = table(draft.advertiserCategories);
    if (!PUBLISHER || !ADVERTISER) return null;
    return {
        weights: { fitMax: fitMax as number, intentMax: intentMax as number, recencyMin: recencyMin as number, sourceMax: sourceMax as number, agentFlag: agentFlag as number },
        recency: { afterDays7: afterDays7 as number, afterDays21: afterDays21 as number, afterDays45: afterDays45 as number },
        thresholds: { hot: hot as number, warm: warm as number },
        agentFlagDays: agentFlagDays as number,
        intent,
        fit: { defaultCategory: defaultCategory as number, categoryBySide: { PUBLISHER, ADVERTISER }, importanceBonus: { KEY: keyBonus as number, ENTERPRISE: enterpriseBonus as number }, localityBonus: localityBonus as number, localityRadiusM: localityRadiusM as number },
    };
}

const INTENT_LABEL: Record<string, string> = {
    CALLED: "A call",
    MESSAGED: "A message",
    FOLLOW_UP: "A follow-up set",
    VISIT_BOOKED: "A visit booked",
    VISIT_DONE: "A visit made",
    ENGAGED: "They replied",
    LINK_OPENED: "Opened the invite link",
    PROPOSAL_SENT: "A proposal sent",
    TOUCH_LOGGED: "A manual touch",
    INBOUND: "Came to ADX themselves (inbound, QR, ads, referral)",
};

/**
 * LH1 (the Lead Hunt): Settings › Leads scoring — D10's five signals as
 * ops tunes them. Every lead is re-scored tonight (and on its next touch)
 * under the new numbers; nothing is recomputed on save.
 */
export function LeadsScoringView({ policy, hunt, sources, live, onSaved }: LeadsScoringViewProps) {
    if (!live || !policy) {
        return (
            <SectionCard title="Leads scoring" description="The five signals behind hot, warm and cold">
                <p className="text-sm text-muted-foreground">
                    {!live ? (
                        "Not connected to the ADX backend — the policy is read from the platform row and cannot be shown from fixtures."
                    ) : (
                        <>
                            This backend does not serve the <code className="rounded bg-muted px-1 py-0.5 text-xs">leads</code> section of the platform row, so scoring cannot be configured here.
                        </>
                    )}
                </p>
            </SectionCard>
        );
    }
    return (
        <>
            <ScoringForm key={JSON.stringify(policy)} policy={policy} onSaved={onSaved} />
            {hunt && hunt.claims && hunt.priority ? <HuntForm key={JSON.stringify(hunt)} hunt={hunt as HuntPolicyFull} onSaved={onSaved} /> : null}
            <SourcesCard sources={sources} onSaved={onSaved} />
        </>
    );
}

function NumberField({ id, label, hint, value, invalid, onChange, className }: { id: string; label: string; hint?: string; value: string; invalid: boolean; onChange: (value: string) => void; className?: string }) {
    return (
        <div className={className ?? "space-y-1.5"}>
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} className="w-24 tabular-nums" aria-invalid={invalid ? true : undefined} />
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
    );
}

function ScoringForm({ policy, onSaved }: { policy: LeadScoringPolicy; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<Draft>(() => toDraft(policy));
    const [busy, setBusy] = React.useState(false);
    const next = fromDraft(draft);
    const patch = next ? changedKeys(policy as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>) : null;
    // The category tables and the intent map are replaced whole: a removed row is a change `changedKeys` cannot express.
    const body = next && patch
        ? {
              ...patch,
              ...(JSON.stringify(policy.intent) !== JSON.stringify(next.intent) ? { intent: next.intent } : {}),
              ...(JSON.stringify(policy.fit.categoryBySide) !== JSON.stringify(next.fit.categoryBySide) ? { fit: { ...(patch.fit as object | undefined), categoryBySide: next.fit.categoryBySide } } : {}),
          }
        : null;
    const dirty = body !== null && Object.keys(body).length > 0;
    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
    const bad = (text: string, key: keyof typeof SETTING_BOUNDS, negative = false) => (negative ? parseNegative(text, SETTING_BOUNDS[key]) : parseBounded(text, SETTING_BOUNDS[key])) === null;
    const thresholdOrder = parseBounded(draft.hot, SETTING_BOUNDS["leads.scoring.thresholds.hot"]) !== null && parseBounded(draft.warm, SETTING_BOUNDS["leads.scoring.thresholds.warm"]) !== null && Number(draft.warm) >= Number(draft.hot);

    async function save() {
        if (!body || !dirty || busy) return;
        setBusy(true);
        try {
            await settingsService.update({ leads: { scoring: body as never } });
            toast.success("Scoring settings saved", { description: "Every open lead is re-scored tonight, and each on its next touch." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the scoring settings.");
        } finally {
            setBusy(false);
        }
    }

    const categoryEditor = (side: "publisherCategories" | "advertiserCategories", title: string) => (
        <div className="space-y-2">
            <div className="text-sm font-medium">{title}</div>
            {draft[side].map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_90px_36px] items-center gap-2">
                    <Input value={row.key} onChange={(event) => set(side, draft[side].map((r, i) => (i === index ? { ...r, key: event.target.value } : r)))} placeholder="category, as typed on the lead" aria-label="Category" />
                    <Input inputMode="numeric" value={row.points} onChange={(event) => set(side, draft[side].map((r, i) => (i === index ? { ...r, points: event.target.value } : r)))} className="tabular-nums" aria-label="Points" aria-invalid={parseBounded(row.points, SETTING_BOUNDS["leads.scoring.fit.points"]) === null ? true : undefined} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove" onClick={() => set(side, draft[side].filter((_, i) => i !== index))}>
                        <Trash2 className="size-4" />
                    </Button>
                </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => set(side, [...draft[side], { key: "", points: "18" }])}>
                <Plus className="mr-1.5 size-3.5" /> Add a category
            </Button>
        </div>
    );

    return (
        <form
            className="space-y-5"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <SectionCard title="Leads scoring" description="Five signals, one score, three temperatures. Every open lead is re-scored nightly and on every touch; a change here shows tomorrow morning.">
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    <NumberField id="ls-fit" label="Fit, up to" value={draft.fitMax} invalid={bad(draft.fitMax, "leads.scoring.weights.fitMax")} onChange={(v) => set("fitMax", v)} />
                    <NumberField id="ls-intent" label="Intent, up to" value={draft.intentMax} invalid={bad(draft.intentMax, "leads.scoring.weights.intentMax")} onChange={(v) => set("intentMax", v)} />
                    <NumberField id="ls-recency" label="Recency, down to" value={draft.recencyMin} invalid={bad(draft.recencyMin, "leads.scoring.weights.recencyMin", true)} onChange={(v) => set("recencyMin", v)} />
                    <NumberField id="ls-source" label="Source, up to" value={draft.sourceMax} invalid={bad(draft.sourceMax, "leads.scoring.weights.sourceMax")} onChange={(v) => set("sourceMax", v)} />
                    <NumberField id="ls-flag" label="Agent's flag" value={draft.agentFlag} invalid={bad(draft.agentFlag, "leads.scoring.weights.agentFlag")} onChange={(v) => set("agentFlag", v)} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <NumberField id="ls-hot" label="Hot from" hint="Score at or above" value={draft.hot} invalid={bad(draft.hot, "leads.scoring.thresholds.hot") || thresholdOrder} onChange={(v) => set("hot", v)} />
                    <NumberField id="ls-warm" label="Warm from" hint="Below it is cold; must be under hot" value={draft.warm} invalid={bad(draft.warm, "leads.scoring.thresholds.warm") || thresholdOrder} onChange={(v) => set("warm", v)} />
                    <NumberField id="ls-flag-days" label="Flag lives (days)" hint="The agent's flag counts this long" value={draft.agentFlagDays} invalid={bad(draft.agentFlagDays, "leads.scoring.agentFlagDays")} onChange={(v) => set("agentFlagDays", v)} />
                </div>
                {thresholdOrder ? <p className="mt-2 text-xs text-destructive">Warm must start below hot.</p> : null}
            </SectionCard>

            <SectionCard title="Recency decay" description="Points taken away by days since the last touch — a call, a message, a visit, a link opened. A touch resets the clock.">
                <div className="grid gap-4 sm:grid-cols-3">
                    <NumberField id="ls-d7" label="After 7 days" value={draft.afterDays7} invalid={bad(draft.afterDays7, "leads.scoring.recency", true)} onChange={(v) => set("afterDays7", v)} />
                    <NumberField id="ls-d21" label="After 21 days" value={draft.afterDays21} invalid={bad(draft.afterDays21, "leads.scoring.recency", true)} onChange={(v) => set("afterDays21", v)} />
                    <NumberField id="ls-d45" label="After 45 days" value={draft.afterDays45} invalid={bad(draft.afterDays45, "leads.scoring.recency", true)} onChange={(v) => set("afterDays45", v)} />
                </div>
            </SectionCard>

            <SectionCard title="Intent" description="Points per signal on the lead's thread over the last 90 days, summed and capped at the intent weight.">
                <div className="grid gap-3 sm:grid-cols-2">
                    {Object.keys(draft.intent).map((key) => (
                        <div key={key} className="flex items-center justify-between gap-3 text-sm">
                            <span>{INTENT_LABEL[key] ?? key}</span>
                            <Input inputMode="numeric" value={draft.intent[key] ?? ""} onChange={(event) => set("intent", { ...draft.intent, [key]: event.target.value })} className="w-20 tabular-nums" aria-label={INTENT_LABEL[key] ?? key} aria-invalid={parseBounded(draft.intent[key] ?? "", SETTING_BOUNDS["leads.scoring.intent"]) === null ? true : undefined} />
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard title="Fit" description="What the business is, for the side. Categories are matched as typed on the lead, case-insensitively; one nobody listed takes the default.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <NumberField id="ls-default" label="Unlisted category" value={draft.defaultCategory} invalid={bad(draft.defaultCategory, "leads.scoring.fit.points")} onChange={(v) => set("defaultCategory", v)} />
                    <NumberField id="ls-key" label="Key account +" value={draft.keyBonus} invalid={bad(draft.keyBonus, "leads.scoring.fit.points")} onChange={(v) => set("keyBonus", v)} />
                    <NumberField id="ls-enterprise" label="Enterprise +" value={draft.enterpriseBonus} invalid={bad(draft.enterpriseBonus, "leads.scoring.fit.points")} onChange={(v) => set("enterpriseBonus", v)} />
                    <NumberField id="ls-locality" label="Locality +" hint="Thin supply for a publisher lead, rich for an advertiser" value={draft.localityBonus} invalid={bad(draft.localityBonus, "leads.scoring.fit.points")} onChange={(v) => set("localityBonus", v)} />
                    <NumberField id="ls-radius" label="Locality radius (m)" value={draft.localityRadiusM} invalid={bad(draft.localityRadiusM, "leads.scoring.fit.localityRadiusM")} onChange={(v) => set("localityRadiusM", v)} />
                </div>
                <div className="mt-5 grid gap-6 lg:grid-cols-2">
                    {categoryEditor("publisherCategories", "Publisher leads")}
                    {categoryEditor("advertiserCategories", "Advertiser leads")}
                </div>
            </SectionCard>

            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    See the result on the{" "}
                    <Link href="/leads" className="text-primary hover:underline">
                        leads desk
                    </Link>
                    .
                </p>
                <Button type="submit" size="sm" disabled={!dirty || busy || next === null}>
                    {busy ? "Saving…" : "Save"}
                </Button>
            </div>
        </form>
    );
}

/* ── LH5: the hunt's numbers — claims (D3), the referral credit (D9), the priority top-up (D7) ── */

export interface HuntPolicy {
    claims: LeadClaimsPolicy | null;
    referralCredit: number | null;
    priority: LeadPriorityPolicy | null;
}
type HuntPolicyFull = { claims: LeadClaimsPolicy; referralCredit: number | null; priority: LeadPriorityPolicy };

interface HuntDraft {
    holdHours: string;
    bronze: string;
    silver: string;
    gold: string;
    platinum: string;
    cooldownDays: string;
    referralCredit: string;
    topUp: string;
    monthlyCap: string;
}

const capText = (cap: number | null): string => (cap === null ? "" : String(cap));

const toHuntDraft = (hunt: HuntPolicyFull): HuntDraft => ({
    holdHours: String(hunt.claims.holdHours),
    bronze: capText(hunt.claims.caps.BRONZE),
    silver: capText(hunt.claims.caps.SILVER),
    gold: capText(hunt.claims.caps.GOLD),
    platinum: capText(hunt.claims.caps.PLATINUM),
    cooldownDays: String(hunt.claims.cooldownDays),
    referralCredit: hunt.referralCredit === null ? "" : String(hunt.referralCredit),
    topUp: String(hunt.priority.topUp),
    monthlyCap: String(hunt.priority.monthlyCap),
});

/** A cap: blank is unlimited; otherwise a whole number in bounds. `undefined` when the text is not a cap. */
function parseCap(text: string): number | null | undefined {
    if (text.trim() === "") return null;
    const value = parseBounded(text, SETTING_BOUNDS["leads.claims.cap"]);
    return value === null ? undefined : value;
}

/** The draft as the three sections, or null while a number is outside what the schema takes. */
export function fromHuntDraft(draft: HuntDraft): { claims: LeadClaimsPolicy; referralCredit: number | null; priority: LeadPriorityPolicy } | null {
    const holdHours = parseBounded(draft.holdHours, SETTING_BOUNDS["leads.claims.holdHours"]);
    const cooldownDays = parseBounded(draft.cooldownDays, SETTING_BOUNDS["leads.claims.cooldownDays"]);
    const caps = { BRONZE: parseCap(draft.bronze), SILVER: parseCap(draft.silver), GOLD: parseCap(draft.gold), PLATINUM: parseCap(draft.platinum) };
    const referralCredit = draft.referralCredit.trim() === "" ? null : parseBoundedDecimal(draft.referralCredit, SETTING_BOUNDS["leads.referralCredit"]);
    const topUp = parseBoundedDecimal(draft.topUp, SETTING_BOUNDS["leads.priority.topUp"]);
    const monthlyCap = parseBoundedDecimal(draft.monthlyCap, SETTING_BOUNDS["leads.priority.monthlyCap"]);
    if (holdHours === null || cooldownDays === null || topUp === null || monthlyCap === null) return null;
    if (draft.referralCredit.trim() !== "" && referralCredit === null) return null;
    if (Object.values(caps).some((cap) => cap === undefined)) return null;
    return {
        claims: { holdHours, caps: caps as LeadClaimsPolicy["caps"], cooldownDays },
        referralCredit,
        priority: { topUp, monthlyCap },
    };
}

function HuntForm({ hunt, onSaved }: { hunt: HuntPolicyFull; onSaved: () => void }) {
    const [draft, setDraft] = React.useState<HuntDraft>(() => toHuntDraft(hunt));
    const [busy, setBusy] = React.useState(false);
    const next = fromHuntDraft(draft);
    const set = <K extends keyof HuntDraft>(key: K, value: HuntDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
    const body = next
        ? {
              ...(JSON.stringify(next.claims) !== JSON.stringify(hunt.claims) ? { claims: next.claims } : {}),
              ...(next.referralCredit !== null && next.referralCredit !== hunt.referralCredit ? { referralCredit: next.referralCredit } : {}),
              ...(JSON.stringify(next.priority) !== JSON.stringify(hunt.priority) ? { priority: next.priority } : {}),
          }
        : null;
    const dirty = body !== null && Object.keys(body).length > 0;
    const capBad = (text: string) => parseCap(text) === undefined;

    async function save() {
        if (!body || !dirty || busy) return;
        setBusy(true);
        try {
            await settingsService.update({ leads: body });
            toast.success("Hunt settings saved", { description: "Claims already running keep their hold; the caps and the top-up apply from the next claim and the next activation." });
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not save the hunt settings.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <form
            className="space-y-5"
            data-testid="hunt-form"
            onSubmit={(event) => {
                event.preventDefault();
                void save();
            }}
        >
            <SectionCard title="Claims" description="A claim on the map holds a lead for the hold; an agent may hold up to their tier's cap at once (blank = unlimited); a claim that lapses unworked waits the cooldown before the same agent may take it again.">
                <div className="grid gap-4 sm:grid-cols-3">
                    <NumberField id="claims-hold" label="Hold (hours)" value={draft.holdHours} invalid={parseBounded(draft.holdHours, SETTING_BOUNDS["leads.claims.holdHours"]) === null} onChange={(value) => set("holdHours", value)} />
                    <NumberField id="claims-cooldown" label="Cooldown after a lapse (days)" value={draft.cooldownDays} invalid={parseBounded(draft.cooldownDays, SETTING_BOUNDS["leads.claims.cooldownDays"]) === null} onChange={(value) => set("cooldownDays", value)} />
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <NumberField id="cap-bronze" label="Bronze holds" value={draft.bronze} invalid={capBad(draft.bronze)} onChange={(value) => set("bronze", value)} />
                    <NumberField id="cap-silver" label="Silver holds" value={draft.silver} invalid={capBad(draft.silver)} onChange={(value) => set("silver", value)} />
                    <NumberField id="cap-gold" label="Gold holds" value={draft.gold} invalid={capBad(draft.gold)} onChange={(value) => set("gold", value)} />
                    <NumberField id="cap-platinum" label="Platinum holds" value={draft.platinum} invalid={capBad(draft.platinum)} onChange={(value) => set("platinum", value)} />
                </div>
            </SectionCard>
            <SectionCard title="Priority zones and referrals" description="A priority zone pays its own top-up per activation, or this default when it names none; the monthly cap is platform-wide across every zone. The referral credit lands in the referrer's wallet when the business they sent activates.">
                <div className="grid gap-4 sm:grid-cols-3">
                    <NumberField id="priority-top-up" label="Default top-up (₹)" value={draft.topUp} invalid={parseBoundedDecimal(draft.topUp, SETTING_BOUNDS["leads.priority.topUp"]) === null} onChange={(value) => set("topUp", value)} />
                    <NumberField id="priority-cap" label="Monthly cap on top-ups (₹)" value={draft.monthlyCap} invalid={parseBoundedDecimal(draft.monthlyCap, SETTING_BOUNDS["leads.priority.monthlyCap"]) === null} onChange={(value) => set("monthlyCap", value)} />
                    <NumberField id="referral-credit" label="Referral credit (₹)" value={draft.referralCredit} invalid={draft.referralCredit.trim() !== "" && parseBoundedDecimal(draft.referralCredit, SETTING_BOUNDS["leads.referralCredit"]) === null} onChange={(value) => set("referralCredit", value)} />
                </div>
            </SectionCard>
            <div className="flex items-center justify-end gap-3">
                <Button type="submit" size="sm" disabled={!dirty || busy || next === null} data-testid="hunt-save">
                    {busy ? "Saving…" : "Save hunt settings"}
                </Button>
            </div>
        </form>
    );
}

/** LH1: the sources with their learned quality — the score's fifth signal, editable where the learner has no sample yet. */
function SourcesCard({ sources, onSaved }: { sources: LeadSource[]; onSaved: () => void }) {
    const [busy, setBusy] = React.useState<string | null>(null);
    const [quality, setQuality] = React.useState<Record<string, string>>({});

    async function run(source: LeadSource, patch: Parameters<typeof leadsService.updateSource>[1], label: string) {
        setBusy(source.id);
        try {
            await leadsService.updateSource(source.id, patch);
            toast.success(label);
            onSaved();
        } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : "Could not update the source.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <SectionCard title="Sources" description="Every door a lead comes through, with the quality the score reads (0–15). Learned nightly from each source's own 90-day conversions once it has twenty leads; typed here until then.">
            {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sources yet.</p>
            ) : (
                <div className="divide-y">
                    {sources.map((source) => {
                        const text = quality[source.id] ?? String(source.quality);
                        const parsed = /^\d{1,2}(\.\d)?$/.test(text) && Number(text) <= 15 ? Number(text) : null;
                        return (
                            <div key={source.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-2 text-sm" data-testid={`lead-source-${source.key}`}>
                                <div className="min-w-0">
                                    <div className="font-medium text-foreground">{source.label}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {SOURCE_KIND_LABEL[source.kind]} · <code className="text-[11px]">{source.key}</code>
                                        {source.quotaPerDay ? ` · ${source.quotaPerDay} a day` : ""}
                                        {source.kind === "FEED" ? (source.termsAcceptedAt ? " · terms confirmed" : " · terms not confirmed") : ""}
                                    </div>
                                </div>
                                <Input
                                    inputMode="decimal"
                                    value={text}
                                    onChange={(event) => setQuality((current) => ({ ...current, [source.id]: event.target.value }))}
                                    onBlur={() => {
                                        if (parsed !== null && parsed !== source.quality) void run(source, { quality: parsed }, `${source.label}: quality ${parsed}`);
                                    }}
                                    className="w-16 tabular-nums"
                                    aria-label={`${source.label} quality`}
                                    aria-invalid={parsed === null ? true : undefined}
                                    disabled={busy === source.id}
                                />
                                <Switch checked={source.isActive} disabled={busy === source.id} aria-label={`${source.label} active`} onCheckedChange={(value) => void run(source, { isActive: value }, value ? `${source.label} switched on` : `${source.label} switched off`)} />
                                {source.kind === "FEED" ? (
                                    <Button size="sm" variant="outline" disabled={busy === source.id} onClick={() => void run(source, { termsAccepted: !source.termsAcceptedAt }, source.termsAcceptedAt ? "Terms confirmation withdrawn" : "Terms confirmed")}>
                                        {source.termsAcceptedAt ? "Withdraw terms" : "Confirm terms"}
                                    </Button>
                                ) : (
                                    <span />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </SectionCard>
    );
}
