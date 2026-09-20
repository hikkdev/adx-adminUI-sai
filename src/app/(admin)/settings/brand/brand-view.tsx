"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Globe, History, LayoutDashboard, Palette, Pipette, RotateCcw, Smartphone, Upload, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/adx/section-card";
import { useBrand } from "@/components/adx/brand";
import { cn } from "@/lib/utils";
import {
    BRAND_FALLBACK,
    DR09_PRIMARY,
    DR11_COLOURS,
    HEX,
    brandChecks,
    brandManagerService,
    onPrimaryFor,
    type Brand,
    type BrandCheck,
    type BrandManagerView,
    type ReleaseSummary,
} from "@/services/branding";
import { uploadService } from "@/services/uploads";
import { readImageSize, sizeProblem, sizeRuleText, type SizeRule } from "./image-size";
import { ConsolePreview, PhonePreview, WebsitePreview } from "./previews";

/**
 * QR-11 / QR-12 — Settings › Brand & theme.
 *
 * One page, four sections, for every surface at once. **Shared identity**
 * holds what all three surfaces draw from — the name, the four colours
 * (with a picker on each swatch, a reset per colour, presets, and the
 * legibility checks), and the five logo files, each with the format, the
 * minimum size and the proportions it must have and where every surface
 * draws it. Then one section per surface — **Apps**, **Admin panel**,
 * **Website** — with that surface's own words and files, a table of what
 * it draws at what size, and a live preview. A file that is not the size
 * its slot needs is refused before it uploads (`image-size.ts`).
 *
 * The form edits a DRAFT (`PUT /branding/draft`); PUBLISH freezes it as the
 * next release (the console recolours at once; the phones follow at their
 * next launch, colours the launch after); HISTORY lists every release with
 * Restore, which republishes an old one.
 */

type ColourKey = "primaryColor" | "deepColor" | "inkColor" | "groundColor";
type LogoKey = "wordmarkUrl" | "wordmarkInverseUrl" | "markUrl" | "markInverseUrl" | "iconUrl";
type KitImageKey = "heroImageUrl" | "ogImageUrl" | "faviconUrl";
type FileKey = LogoKey | KitImageKey | "appIconUrl";

const COLOURS: { key: ColourKey; label: string; hint: string }[] = [
    { key: "primaryColor", label: "Primary", hint: "Buttons, links, the active tab, the FAB — every DR 09 component." },
    { key: "deepColor", label: "Deep", hint: "The tile the icon sits on; the ground of inverse lockups." },
    { key: "inkColor", label: "Ink", hint: "Headlines, body text and the website's dark hero." },
    { key: "groundColor", label: "Ground", hint: "The light page behind everything." },
];

/** A file a slot takes: what it must be, and where each surface draws it at what size. */
interface FileSpec {
    key: FileKey;
    label: string;
    formats: string;
    /** The instruction line under the slot. */
    size: string;
    /** Enforced on a raster file before it uploads; an SVG passes. */
    rule?: SizeRule;
    proportions?: string;
    /** Where it lands, per surface. */
    drawn: { surface: "Apps" | "Admin panel" | "Website"; where: string }[];
    dark: boolean;
    accept: string;
}

const LOGO_ACCEPT = ".svg,.png";

const SHARED_FILES: FileSpec[] = [
    {
        key: "wordmarkUrl",
        label: "Wordmark",
        formats: "SVG (preferred) or PNG with a transparent ground",
        size: "SVG at any size; a PNG at least 1130 × 417 px (3× of the 376 × 139 it is drawn at)",
        rule: { kind: "min", width: 1130 },
        proportions: "2.71 : 1, as DR 11 cuts it — the surfaces set the height and let the width follow",
        drawn: [
            { surface: "Apps", where: "sign-in sheet 20 dp high · boot splash 28 dp" },
            { surface: "Admin panel", where: "header 18 px · login card 22 px" },
            { surface: "Website", where: "navigation 24 px · footer 20 px · emails 32 px" },
        ],
        dark: false,
        accept: LOGO_ACCEPT,
    },
    {
        key: "wordmarkInverseUrl",
        label: "Wordmark, inverse",
        formats: "SVG (preferred) or PNG with a transparent ground, the letters white",
        size: "Same as the wordmark — at least 1130 × 417 px as a PNG",
        rule: { kind: "min", width: 1130 },
        proportions: "2.71 : 1",
        drawn: [
            { surface: "Apps", where: "boot splash on the dark scheme 28 dp" },
            { surface: "Admin panel", where: "the dark preview of a release" },
            { surface: "Website", where: "the hero's navigation on the ink ground 24 px" },
        ],
        dark: true,
        accept: LOGO_ACCEPT,
    },
    {
        key: "markUrl",
        label: "Mark",
        formats: "SVG (preferred) or PNG with a transparent ground",
        size: "SVG at any size; a PNG at least 355 × 417 px",
        rule: { kind: "min", width: 355, height: 417 },
        proportions: "0.85 : 1 — the “A” glyph on its own, no tile",
        drawn: [
            { surface: "Apps", where: "app bar 14–22 dp · avatars with no photo" },
            { surface: "Admin panel", where: "compact header on narrow windows 20 px" },
            { surface: "Website", where: "favicon fallback · section badges 24 px" },
        ],
        dark: false,
        accept: LOGO_ACCEPT,
    },
    {
        key: "markInverseUrl",
        label: "Mark, inverse",
        formats: "SVG (preferred) or PNG with a transparent ground, the glyph white",
        size: "Same as the mark — at least 355 × 417 px as a PNG",
        rule: { kind: "min", width: 355, height: 417 },
        proportions: "0.85 : 1",
        drawn: [
            { surface: "Apps", where: "the agent app's scan FAB 22 dp · the source of the launcher icon" },
            { surface: "Admin panel", where: "dark release previews" },
            { surface: "Website", where: "the mark on red buttons and the icon tile" },
        ],
        dark: true,
        accept: LOGO_ACCEPT,
    },
    {
        key: "iconUrl",
        label: "Icon tile",
        formats: "Square SVG (preferred) or PNG, the white mark centred on the deep colour, no transparency",
        size: "SVG at any size; a PNG square, at least 512 × 512 px",
        rule: { kind: "square", min: 512 },
        proportions: "1 : 1, the mark at about half the side",
        drawn: [
            { surface: "Apps", where: "nothing at run time — see the App icon slot below" },
            { surface: "Admin panel", where: "tab icon 32 px · Apple touch icon 180 px" },
            { surface: "Website", where: "favicon when none of its own is set · 192 and 512 px for the web manifest" },
        ],
        dark: false,
        accept: LOGO_ACCEPT,
    },
];

const APP_ICON: FileSpec = {
    key: "appIconUrl",
    label: "App icon (launcher)",
    formats: "PNG, no transparency",
    size: "Exactly 1024 × 1024 px — the mark inside the central 66 % (Android's adaptive icon crops the rest)",
    rule: { kind: "exact", width: 1024, height: 1024 },
    proportions: "1 : 1, square corners — the OS rounds them",
    drawn: [
        { surface: "Apps", where: "the launcher icon on every phone, at the NEXT build — DR 11's is baked into the builds in mobile/dist" },
    ],
    dark: false,
    accept: ".png",
};

const WEBSITE_FILES: FileSpec[] = [
    {
        key: "heroImageUrl",
        label: "Hero image",
        formats: "JPG or WebP (a PNG is accepted but heavier)",
        size: "At least 1920 × 1080 px, 16 : 9, under 2 MB — it sits under a dark wash with the opening line on top",
        rule: { kind: "min", width: 1920, height: 1080 },
        proportions: "16 : 9",
        drawn: [{ surface: "Website", where: "behind the hero on the home page, full width" }],
        dark: false,
        accept: ".jpg,.jpeg,.png,.webp",
    },
    {
        key: "ogImageUrl",
        label: "Share card",
        formats: "PNG or JPG",
        size: "Exactly 1200 × 630 px — what WhatsApp, LinkedIn and X show for a link to the site",
        rule: { kind: "exact", width: 1200, height: 630 },
        proportions: "1.91 : 1",
        drawn: [{ surface: "Website", where: "the Open Graph image on every page" }],
        dark: false,
        accept: ".jpg,.jpeg,.png",
    },
    {
        key: "faviconUrl",
        label: "Favicon",
        formats: "Square SVG (preferred) or PNG",
        size: "SVG at any size; a PNG square, at least 512 × 512 px — the browser scales it to 16, 32 and 180",
        rule: { kind: "square", min: 512 },
        proportions: "1 : 1",
        drawn: [{ surface: "Website", where: "the tab icon; falls back to the icon tile" }],
        dark: false,
        accept: ".svg,.png",
    },
];

interface FormState {
    platformName: string;
    tagline: string;
    colours: Record<ColourKey, string>;
    /** One per line. */
    taglines: string;
    consoleTitle: string;
    siteTitle: string;
    siteDescription: string;
}

function formFrom(draft: BrandManagerView["draft"]): FormState {
    const text = (key: string) => (typeof draft[key] === "string" ? (draft[key] as string) : "");
    const list = Array.isArray(draft["taglines"]) ? (draft["taglines"] as string[]) : [];
    return {
        platformName: text("platformName"),
        tagline: text("tagline"),
        colours: { primaryColor: text("primaryColor"), deepColor: text("deepColor"), inkColor: text("inkColor"), groundColor: text("groundColor") },
        taglines: list.join("\n"),
        consoleTitle: text("consoleTitle"),
        siteTitle: text("siteTitle"),
        siteDescription: text("siteDescription"),
    };
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** The form laid over the stored draft: what the previews draw and the checks grade. */
export function previewOf(base: Brand, form: FormState): Brand {
    const next: Brand = { ...base, website: { ...base.website }, apps: { ...base.apps }, console: { ...base.console } };
    for (const c of COLOURS) {
        const v = form.colours[c.key].trim();
        if (HEX.test(v)) next[c.key] = v.toUpperCase();
        else if (v === "") next[c.key] = DR11_COLOURS[c.key];
    }
    next.platformName = form.platformName.trim() || BRAND_FALLBACK.platformName;
    next.tagline = form.tagline.trim() || BRAND_FALLBACK.tagline;
    const list = lines(form.taglines);
    next.website.taglines = list.length > 0 ? list : [...BRAND_FALLBACK.website.taglines];
    next.website.title = form.siteTitle.trim() || BRAND_FALLBACK.website.title;
    next.website.description = form.siteDescription.trim() || BRAND_FALLBACK.website.description;
    next.console.title = form.consoleTitle.trim() || BRAND_FALLBACK.console.title;
    next.onPrimaryColor = onPrimaryFor(next.primaryColor, next.inkColor);
    return next;
}

function patchOf(form: FormState) {
    const list = lines(form.taglines);
    return {
        platformName: form.platformName.trim() || null,
        tagline: form.tagline.trim() || null,
        primaryColor: form.colours.primaryColor.trim() || null,
        deepColor: form.colours.deepColor.trim() || null,
        inkColor: form.colours.inkColor.trim() || null,
        groundColor: form.colours.groundColor.trim() || null,
        taglines: list.length > 0 ? list : null,
        consoleTitle: form.consoleTitle.trim() || null,
        siteTitle: form.siteTitle.trim() || null,
        siteDescription: form.siteDescription.trim() || null,
    };
}

const same = (a: FormState, b: FormState) => JSON.stringify(patchOf(a)) === JSON.stringify(patchOf(b));

interface BrandViewProps {
    data: BrandManagerView;
    mayEdit: boolean;
    onChanged: () => void;
}

export function BrandView({ data, mayEdit, onChanged }: BrandViewProps) {
    // Keyed on the draft's version so a save or a restore starts the form afresh from what the server holds.
    return <BrandEditor key={data.draftBrand.version} data={data} mayEdit={mayEdit} onChanged={onChanged} />;
}

function BrandEditor({ data, mayEdit, onChanged }: BrandViewProps) {
    const { reload: reloadBrand } = useBrand();
    const initial = React.useMemo(() => formFrom(data.draft), [data.draft]);
    const [form, setForm] = React.useState<FormState>(initial);
    const [busy, setBusy] = React.useState<string | null>(null);
    const [publishOpen, setPublishOpen] = React.useState(false);
    const [historyOpen, setHistoryOpen] = React.useState(false);

    const edited = !same(form, initial);
    const preview = React.useMemo(() => previewOf(data.draftBrand, form), [data.draftBrand, form]);
    const checks = React.useMemo(() => brandChecks(preview), [preview]);
    const badColour = COLOURS.find((c) => form.colours[c.key].trim() && !HEX.test(form.colours[c.key].trim()));

    const setColour = (key: ColourKey, value: string) => setForm((f) => ({ ...f, colours: { ...f.colours, [key]: value } }));
    const setText = (key: "platformName" | "tagline" | "taglines" | "consoleTitle" | "siteTitle" | "siteDescription") => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));

    /** Runs a write, says how it went, re-reads on success. Answers whether it succeeded. */
    const run = async (label: string, work: () => Promise<unknown>, said: string): Promise<boolean> => {
        setBusy(label);
        try {
            await work();
            toast.success(said);
            onChanged();
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "That did not go through.");
            return false;
        } finally {
            setBusy(null);
        }
    };

    const saveDraft = () => {
        if (badColour) {
            toast.error(`${badColour.label} must be a hex colour like #E40209.`);
            return;
        }
        void run("save", () => brandManagerService.saveDraft(patchOf(form)), "Draft saved — nothing is live until you publish");
    };

    const uploadTo = (spec: FileSpec) => async (file: File) => {
        if (spec.rule) {
            const size = await readImageSize(file);
            const problem = size ? sizeProblem(size, spec.rule) : null;
            if (problem) {
                toast.error(`${spec.label}: ${problem}`);
                return;
            }
        }
        await run(
            spec.key,
            async () => {
                const uploaded = await uploadService.upload(file, "BRANDING");
                await brandManagerService.saveDraft({ [spec.key]: uploaded.url });
            },
            `${spec.label} replaced on the draft`,
        );
    };

    const resetField = (key: FileKey) => run(key, () => brandManagerService.saveDraft({ [key]: null }), "Back to DR 11 on the draft");

    const isDefault = (key: string) => data.draft[key] === null || data.draft[key] === undefined;

    const urlOf = (key: FileKey): string | null => {
        if (key === "appIconUrl") return data.draftBrand.apps.iconUrl;
        if (key === "heroImageUrl" || key === "ogImageUrl" || key === "faviconUrl") return data.draftBrand.website[key];
        return data.draftBrand[key];
    };

    const publish = async (note: string) => {
        const ok = await run(
            "publish",
            async () => {
                const view = await brandManagerService.publish(note.trim() || undefined);
                await reloadBrand();
                return view;
            },
            `Published — release #${(data.release?.number ?? 0) + 1} is live`,
        );
        // A refusal (nothing to publish, no permission) leaves the dialog up with its reason toasted.
        if (ok) setPublishOpen(false);
    };

    const flagged = data.checks.filter((c) => c.level !== "ok");

    const slot = (spec: FileSpec) => (
        <FileSlot
            key={spec.key}
            spec={spec}
            url={urlOf(spec.key)}
            ground={spec.dark ? preview.primaryColor : preview.groundColor}
            isDefault={isDefault(spec.key)}
            busy={busy === spec.key}
            disabled={!mayEdit || busy !== null}
            onFile={uploadTo(spec)}
            onReset={() => void resetField(spec.key)}
        />
    );

    return (
        <div className="space-y-5">
            {/* ── the header: what is live, what is not, the three verbs ──── */}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card px-5 py-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Palette className="size-4 text-muted-foreground" aria-hidden />
                        <h2 className="text-base font-semibold">Brand & theme</h2>
                    </div>
                    <p className="text-sm text-muted-foreground" data-testid="brand-status">
                        {data.release
                            ? `Live: release #${data.release.number} — ${new Date(data.release.publishedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}${
                                  data.release.publishedBy?.name ? ` by ${data.release.publishedBy.name}` : ""
                              }${data.release.note ? ` · “${data.release.note}”` : ""}`
                            : "Live: DR 11 as shipped — nothing has been published yet."}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {edited ? <Badge variant="outline">Unsaved edits</Badge> : null}
                        {data.dirty ? <Badge>Draft has unpublished changes</Badge> : <Badge variant="secondary">Draft matches what is live</Badge>}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} data-testid="brand-history-open">
                        <History className="mr-1.5 size-4" aria-hidden />
                        History
                    </Button>
                    <Button variant="outline" size="sm" onClick={saveDraft} disabled={!mayEdit || !edited || busy !== null} data-testid="brand-save-draft">
                        Save draft
                    </Button>
                    <Button size="sm" onClick={() => setPublishOpen(true)} disabled={!mayEdit || edited || !data.dirty || busy !== null} data-testid="brand-publish-open">
                        Publish…
                    </Button>
                </div>
            </div>

            {/* ── 1 · shared identity ───────────────────────────────────────── */}
            <SectionCard
                title="1 · Shared identity"
                description="What every surface draws from: the name, the four colours and the logo files. Change these once; the apps, the admin panel and the website all follow."
            >
                <div data-testid="brand-section-shared" className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="brand-name" className="flex items-center gap-2">
                                Platform name {isDefault("platformName") && !form.platformName ? <DefaultBadge /> : null}
                            </Label>
                            <Input id="brand-name" aria-label="Platform name" value={form.platformName} onChange={setText("platformName")} placeholder="ADX" maxLength={60} disabled={!mayEdit} />
                            <p className="text-xs text-muted-foreground">Up to 60 characters. The apps' accessibility label, the console's tab title prefix, the site's default title.</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold">Colours</h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            The primary is every button, link and tab on the phones and the console. Pick, type a hex, or take a preset — the previews below and the checks answer as you go.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2" data-testid="brand-presets">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!mayEdit}
                                onClick={() => setForm((f) => ({ ...f, colours: { primaryColor: "", deepColor: "", inkColor: "", groundColor: "" } }))}
                                data-testid="brand-preset-dr11"
                            >
                                <Swatch colour={DR11_COLOURS.primaryColor} /> DR 11 set
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={!mayEdit} onClick={() => setColour("primaryColor", DR09_PRIMARY)} data-testid="brand-preset-dr09">
                                <Swatch colour={DR09_PRIMARY} /> DR 09 dark red
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={!mayEdit} onClick={() => setColour("primaryColor", preview.deepColor)} data-testid="brand-preset-deep">
                                <Swatch colour={preview.deepColor} /> Deep as primary
                            </Button>
                        </div>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            {COLOURS.map((c) => (
                                <ColourRow
                                    key={c.key}
                                    label={c.label}
                                    hint={c.hint}
                                    fieldKey={c.key}
                                    value={form.colours[c.key]}
                                    effective={preview[c.key]}
                                    isDefault={!form.colours[c.key].trim()}
                                    disabled={!mayEdit}
                                    onChange={(v) => setColour(c.key, v)}
                                />
                            ))}
                        </div>
                        <div className="mt-5 space-y-2" data-testid="brand-checks">
                            <p className="text-xs font-medium text-muted-foreground">Legibility, on these colours</p>
                            {checks.map((check) => (
                                <CheckRow key={check.key} check={check} />
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-sm font-semibold">Logo files</h4>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Five files, each drawn by all three surfaces. Every slot says the format, the size and the proportions it needs and where it lands; a file of the wrong size is refused before it uploads.
                        </p>
                        <div className="mt-3 grid gap-4 lg:grid-cols-2">{SHARED_FILES.map(slot)}</div>
                    </div>
                </div>
            </SectionCard>

            {/* ── 2 · apps ──────────────────────────────────────────────────── */}
            <SectionCard title="2 · Apps" description="The publisher/advertiser app and the agent app — Android and iOS.">
                <div data-testid="brand-section-apps" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="space-y-6">
                        <div className="space-y-1.5">
                            <Label htmlFor="brand-tagline" className="flex items-center gap-2">
                                Sign-in tagline {isDefault("tagline") && !form.tagline ? <DefaultBadge /> : null}
                            </Label>
                            <Input id="brand-tagline" aria-label="Tagline" value={form.tagline} onChange={setText("tagline")} placeholder="Space that gets seen." maxLength={120} disabled={!mayEdit} />
                            <p className="text-xs text-muted-foreground">Up to 120 characters — one line, under the wordmark on the sign-in sheet, in the primary colour.</p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">{slot(APP_ICON)}</div>
                        <DrawnTable
                            surface="Apps"
                            rows={[
                                ["Wordmark", "sign-in sheet 20 dp · boot splash 28 dp — the shared file"],
                                ["Mark, inverse", "the agent app's scan FAB, 22 dp on the primary disc"],
                                ["App icon", "1024 × 1024 PNG above — at the next build; until then DR 11's"],
                                ["Colours", "every DR 09 component; a published change reaches a phone the launch after next"],
                                ["Tagline", "the sign-in sheet, at the next launch"],
                            ]}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
                        <PhonePreview brand={preview} />
                    </div>
                </div>
            </SectionCard>

            {/* ── 3 · admin panel ───────────────────────────────────────────── */}
            <SectionCard title="3 · Admin panel" description="This console — the header, the login page, the browser tab.">
                <div data-testid="brand-section-console" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-6">
                        <div className="space-y-1.5">
                            <Label htmlFor="brand-console-title" className="flex items-center gap-2">
                                Console title {isDefault("consoleTitle") && !form.consoleTitle ? <DefaultBadge /> : null}
                            </Label>
                            <Input id="brand-console-title" aria-label="Console title" value={form.consoleTitle} onChange={setText("consoleTitle")} placeholder="ADX Admin" maxLength={40} disabled={!mayEdit} />
                            <p className="text-xs text-muted-foreground">Up to 40 characters — the browser tab reads “Page · Console title”.</p>
                        </div>
                        <DrawnTable
                            surface="Admin panel"
                            rows={[
                                ["Wordmark", "header 18 px high · login card 22 px — the shared file"],
                                ["Icon tile", "tab icon 32 px · Apple touch icon 180 px — the shared file"],
                                ["Primary colour", "every button, link and focus ring — the moment a release is published"],
                                ["Console title", "the browser tab and the login page's heading"],
                            ]}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
                        <ConsolePreview brand={preview} />
                    </div>
                </div>
            </SectionCard>

            {/* ── 4 · website ───────────────────────────────────────────────── */}
            <SectionCard title="4 · Website" description="The public site — read from the same brand the moment it is built. Everything here is ready for it.">
                <div data-testid="brand-section-website" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="brand-site-title" className="flex items-center gap-2">
                                    Site title {isDefault("siteTitle") && !form.siteTitle ? <DefaultBadge /> : null}
                                </Label>
                                <Input id="brand-site-title" aria-label="Site title" value={form.siteTitle} onChange={setText("siteTitle")} placeholder={BRAND_FALLBACK.website.title} maxLength={70} disabled={!mayEdit} />
                                <p className="text-xs text-muted-foreground">Up to 70 characters — the tab title and the headline of a search result.</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="brand-site-description" className="flex items-center gap-2">
                                    Meta description {isDefault("siteDescription") && !form.siteDescription ? <DefaultBadge /> : null}
                                </Label>
                                <Textarea
                                    id="brand-site-description"
                                    aria-label="Site description"
                                    value={form.siteDescription}
                                    onChange={setText("siteDescription")}
                                    placeholder={BRAND_FALLBACK.website.description}
                                    maxLength={160}
                                    rows={2}
                                    disabled={!mayEdit}
                                />
                                <p className="text-xs text-muted-foreground">Up to 160 characters — the two lines under a search result and a shared link.</p>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="brand-taglines" className="flex items-center gap-2">
                                Hero lines, one per line {isDefault("taglines") && !form.taglines.trim() ? <DefaultBadge /> : null}
                            </Label>
                            <Textarea
                                id="brand-taglines"
                                aria-label="Website taglines"
                                value={form.taglines}
                                onChange={setText("taglines")}
                                placeholder={BRAND_FALLBACK.website.taglines.join("\n")}
                                rows={3}
                                disabled={!mayEdit}
                            />
                            <p className="text-xs text-muted-foreground">Up to six, each up to 80 characters; the hero rotates them. Empty means DR 11&apos;s three.</p>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">{WEBSITE_FILES.map(slot)}</div>
                        <DrawnTable
                            surface="Website"
                            rows={[
                                ["Wordmark, inverse", "navigation on the ink hero 24 px — the shared file"],
                                ["Wordmark", "footer 20 px · transactional emails 32 px — the shared file"],
                                ["Hero image", "under the opening line, full width, with a dark wash"],
                                ["Share card", "the Open Graph image on every page"],
                                ["Favicon", "the tab icon; the icon tile when none is set"],
                                ["Primary colour", "buttons and links; the ink is the hero's ground"],
                            ]}
                        />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
                        <WebsitePreview brand={preview} />
                    </div>
                </div>
            </SectionCard>

            <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} flagged={flagged} busy={busy === "publish"} onPublish={publish} />
            <HistorySheet
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                mayEdit={mayEdit}
                onRestored={async () => {
                    await reloadBrand();
                    onChanged();
                }}
            />
        </div>
    );
}

// ── pieces ──────────────────────────────────────────────────────────────────

function DefaultBadge() {
    return <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">DR 11</span>;
}

function Swatch({ colour }: { colour: string }) {
    return <span className="mr-1.5 inline-block size-3 rounded-sm border" style={{ background: colour }} aria-hidden />;
}

const SURFACE_ICON = { Apps: Smartphone, "Admin panel": LayoutDashboard, Website: Globe } as const;

/** What a surface draws, at what size — the plain table under each surface's fields. */
function DrawnTable({ surface, rows }: { surface: keyof typeof SURFACE_ICON; rows: [string, string][] }) {
    const Icon = SURFACE_ICON[surface];
    return (
        <div className="rounded-md border" data-testid={`brand-drawn-${surface.toLowerCase().replace(" ", "-")}`}>
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium">
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                What {surface === "Apps" ? "the apps draw" : surface === "Website" ? "the site draws" : "the console draws"}
            </div>
            <dl className="divide-y text-xs">
                {rows.map(([what, where]) => (
                    <div key={what} className="grid grid-cols-[140px_1fr] gap-2 px-3 py-1.5">
                        <dt className="font-medium text-foreground">{what}</dt>
                        <dd className="text-muted-foreground">{where}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function ColourRow({
    label,
    hint,
    fieldKey,
    value,
    effective,
    isDefault,
    disabled,
    onChange,
}: {
    label: string;
    hint: string;
    fieldKey: ColourKey;
    value: string;
    effective: string;
    isDefault: boolean;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const picker = React.useRef<HTMLInputElement>(null);
    const invalid = value.trim() !== "" && !HEX.test(value.trim());
    return (
        <div className="space-y-1.5" data-testid={`brand-colour-${fieldKey}`}>
            <Label htmlFor={`brand-${fieldKey}`} className="flex items-center gap-2">
                {label}
                {isDefault ? <DefaultBadge /> : null}
            </Label>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="relative size-9 shrink-0 rounded-md border shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    style={{ background: effective }}
                    onClick={() => picker.current?.click()}
                    disabled={disabled}
                    aria-label={`Pick the ${label.toLowerCase()} colour`}
                    title="Pick a colour"
                >
                    <Pipette className="absolute bottom-0.5 right-0.5 size-3 rounded-sm bg-white/80 p-px text-neutral-700" aria-hidden />
                </button>
                <input
                    ref={picker}
                    type="color"
                    className="sr-only"
                    tabIndex={-1}
                    value={effective}
                    onChange={(e) => onChange(e.target.value.toUpperCase())}
                    data-testid={`brand-pick-${fieldKey}`}
                    aria-hidden
                />
                <Input
                    id={`brand-${fieldKey}`}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={DR11_COLOURS[fieldKey]}
                    className={cn("font-mono text-xs", invalid ? "border-destructive" : "")}
                    maxLength={7}
                    aria-label={`${label} colour`}
                    aria-invalid={invalid || undefined}
                    disabled={disabled}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => onChange("")}
                    disabled={disabled || isDefault}
                    aria-label={`Reset the ${label.toLowerCase()} colour to DR 11`}
                    data-testid={`brand-reset-${fieldKey}`}
                >
                    <RotateCcw className="size-3.5" aria-hidden />
                </Button>
            </div>
            <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
    );
}

function CheckRow({ check }: { check: BrandCheck }) {
    const Icon = check.level === "ok" ? CheckCircle2 : check.level === "warn" ? AlertTriangle : XCircle;
    const tone = check.level === "ok" ? "text-emerald-600" : check.level === "warn" ? "text-amber-600" : "text-destructive";
    return (
        <div className="flex items-start gap-2 text-xs" data-testid={`brand-check-${check.key}`} data-level={check.level}>
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} aria-hidden />
            <span className="inline-flex shrink-0 items-center gap-0.5" aria-hidden>
                <span className="size-3 rounded-sm border" style={{ background: check.pair[0] }} />
                <span className="size-3 rounded-sm border" style={{ background: check.pair[1] }} />
            </span>
            <span className="text-foreground">{check.label}</span>
            <span className="font-mono text-muted-foreground">{`${check.ratio} : 1`}</span>
            <span className={cn("text-muted-foreground", check.level !== "ok" ? tone : "")}>{check.message}</span>
        </div>
    );
}

function FileSlot({
    spec,
    url,
    ground,
    isDefault,
    busy,
    disabled,
    onFile,
    onReset,
}: {
    spec: FileSpec;
    url: string | null;
    ground: string;
    isDefault: boolean;
    busy: boolean;
    disabled: boolean;
    onFile: (file: File) => void;
    onReset: () => void;
}) {
    return (
        <div className="rounded-lg border p-3" data-testid={`brand-logo-${spec.key}`}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{spec.label}</span>
                {isDefault ? <DefaultBadge /> : null}
            </div>
            <div className="mt-2 flex h-20 items-center justify-center overflow-hidden rounded-md border" style={{ background: ground }}>
                {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- the brand's own file
                    <img src={url} alt="" aria-hidden style={{ maxHeight: 44, maxWidth: "80%" }} />
                ) : (
                    <span className="text-xs text-muted-foreground">None yet</span>
                )}
            </div>
            <dl className="mt-2 space-y-1 text-xs" data-testid={`brand-spec-${spec.key}`}>
                <div className="grid grid-cols-[76px_1fr] gap-1">
                    <dt className="text-muted-foreground">Format</dt>
                    <dd className="text-foreground">{spec.formats}</dd>
                </div>
                <div className="grid grid-cols-[76px_1fr] gap-1">
                    <dt className="text-muted-foreground">Size</dt>
                    <dd className="text-foreground">
                        {spec.size}
                        {spec.rule ? <span className="text-muted-foreground">{` (${sizeRuleText(spec.rule)} — checked on upload)`}</span> : null}
                    </dd>
                </div>
                {spec.proportions ? (
                    <div className="grid grid-cols-[76px_1fr] gap-1">
                        <dt className="text-muted-foreground">Proportions</dt>
                        <dd className="text-foreground">{spec.proportions}</dd>
                    </div>
                ) : null}
                <div className="grid grid-cols-[76px_1fr] gap-1">
                    <dt className="text-muted-foreground">Drawn</dt>
                    <dd className="space-y-0.5 text-foreground">
                        {spec.drawn.map((d) => (
                            <div key={d.surface}>
                                <span className="font-medium">{d.surface}:</span> {d.where}
                            </div>
                        ))}
                    </dd>
                </div>
            </dl>
            <div className="mt-2 flex items-center gap-2">
                <label
                    className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted",
                        disabled ? "pointer-events-none opacity-60" : "",
                    )}
                >
                    <Upload className="size-3.5" aria-hidden />
                    {busy ? "Uploading…" : "Replace"}
                    <input
                        type="file"
                        accept={spec.accept}
                        className="sr-only"
                        disabled={disabled}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) onFile(file);
                        }}
                        aria-label={`Replace the ${spec.label.toLowerCase()}`}
                    />
                </label>
                {!isDefault ? (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onReset} disabled={disabled}>
                        <RotateCcw className="mr-1 size-3.5" aria-hidden />
                        Back to DR 11
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

function PublishDialog({
    open,
    onOpenChange,
    flagged,
    busy,
    onPublish,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    flagged: BrandCheck[];
    busy: boolean;
    onPublish: (note: string) => Promise<void>;
}) {
    const [note, setNote] = React.useState("");
    const failing = flagged.some((c) => c.level === "fail");
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Publish this brand?</DialogTitle>
                    <DialogDescription>
                        The draft becomes the release every surface draws — the console at once, the phones at their next launch (colours the launch after). A note helps the history read.
                    </DialogDescription>
                </DialogHeader>
                {flagged.length > 0 ? (
                    <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs" data-testid="brand-publish-warnings">
                        <p className="font-medium text-amber-900">{failing ? "Some of this will be hard to read:" : "Worth a look before it goes out:"}</p>
                        {flagged.map((c) => (
                            <p key={c.key} className="text-amber-900">
                                {c.label} — {c.ratio} : 1. {c.message}
                            </p>
                        ))}
                    </div>
                ) : null}
                <div className="space-y-1.5">
                    <Label htmlFor="brand-note">Release note</Label>
                    <Input id="brand-note" aria-label="Release note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Darker red for Diwali" maxLength={200} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                        Not now
                    </Button>
                    <Button onClick={() => void onPublish(note)} disabled={busy} data-testid="brand-publish-confirm">
                        {busy ? "Publishing…" : failing ? "Publish anyway" : "Publish"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function HistorySheet({ open, onOpenChange, mayEdit, onRestored }: { open: boolean; onOpenChange: (open: boolean) => void; mayEdit: boolean; onRestored: () => Promise<void> }) {
    const [rows, setRows] = React.useState<ReleaseSummary[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [restoring, setRestoring] = React.useState<ReleaseSummary | null>(null);
    const [busy, setBusy] = React.useState(false);

    const load = React.useCallback(async () => {
        setError(null);
        try {
            const page = await brandManagerService.releases(1, 50);
            setRows(page.rows);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not read the history.");
        }
    }, []);

    React.useEffect(() => {
        if (!open) return;
        let active = true;
        void (async () => {
            try {
                const page = await brandManagerService.releases(1, 50);
                if (active) setRows(page.rows);
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : "Could not read the history.");
            }
        })();
        return () => {
            active = false;
        };
    }, [open]);

    const restore = async () => {
        if (!restoring) return;
        setBusy(true);
        try {
            await brandManagerService.restore(restoring.number);
            toast.success(`Release #${restoring.number} is live again, as a new release`);
            setRestoring(null);
            await onRestored();
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not restore that release.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-xl" data-testid="brand-history">
                <SheetHeader>
                    <SheetTitle>Brand history</SheetTitle>
                    <SheetDescription>Every release, newest first. Restore publishes an old one again — the history only grows.</SheetDescription>
                </SheetHeader>
                <div className="mt-4 space-y-2">
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                    {rows === null && !error ? <p className="text-sm text-muted-foreground">Reading…</p> : null}
                    {rows?.length === 0 ? <p className="text-sm text-muted-foreground">Nothing published yet — DR 11 as shipped is live.</p> : null}
                    {rows?.map((r) => (
                        <div key={r.number} className="flex items-center gap-3 rounded-md border p-3" data-testid={`brand-release-${r.number}`}>
                            <div className="flex shrink-0 gap-0.5" aria-hidden>
                                {[r.colours.primaryColor, r.colours.deepColor, r.colours.inkColor, r.colours.groundColor].map((c, i) => (
                                    <span key={i} className="size-4 rounded-sm border" style={{ background: c }} />
                                ))}
                            </div>
                            {/* eslint-disable-next-line @next/next/no-img-element -- the release's own file */}
                            <img src={r.wordmarkUrl} alt="" aria-hidden style={{ height: 14 }} className="shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                    {`#${r.number}`}
                                    {r.live ? (
                                        <Badge className="ml-2" variant="default">
                                            Live
                                        </Badge>
                                    ) : null}
                                    {r.note ? <span className="ml-2 font-normal text-muted-foreground">{r.note}</span> : null}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {new Date(r.publishedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                    {r.publishedBy?.name ? ` · ${r.publishedBy.name}` : ""}
                                    {` · ${r.platformName} — ${r.tagline}`}
                                </p>
                            </div>
                            {!r.live ? (
                                <Button size="sm" variant="outline" onClick={() => setRestoring(r)} disabled={!mayEdit || busy} data-testid={`brand-restore-${r.number}`}>
                                    Restore
                                </Button>
                            ) : null}
                        </div>
                    ))}
                </div>
            </SheetContent>

            <AlertDialog open={restoring !== null} onOpenChange={(o) => (!o ? setRestoring(null) : undefined)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{restoring ? `Restore release #${restoring.number}?` : ""}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Its colours, logos and words become the draft and go live at once as a new release. The current release stays in the history.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Keep the current one</AlertDialogCancel>
                        <AlertDialogAction onClick={(e) => { e.preventDefault(); void restore(); }} disabled={busy} data-testid="brand-restore-confirm">
                            {busy ? "Restoring…" : "Restore and publish"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Sheet>
    );
}
