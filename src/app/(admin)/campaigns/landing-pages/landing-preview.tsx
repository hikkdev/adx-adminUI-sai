"use client";

import { previewUrl, type LandingBlock, type LandingPageStatus, type LandingTheme } from "@/services/landing-pages";

/**
 * A landing page as people see it — the drawer on the Landing pages tab
 * and the campaign page's Landing page card draw it through this.
 *
 * A PUBLISHED page is the live document itself, `/p/:slug` on the origin
 * that serves it, in a sandboxed frame with scripts off — so the preview
 * never sends the page's view beacon and an admin looking does not count
 * as a visitor. A DRAFT is no page (`/p/:slug` answers only for a
 * published one), so its blocks are drawn from the stored row instead.
 */
export function LandingPreview({
    slug,
    status,
    blocks,
    theme,
    title,
    height = 520,
}: {
    slug: string;
    status: LandingPageStatus;
    blocks: LandingBlock[] | null;
    theme: LandingTheme | null;
    title: string;
    height?: number;
}) {
    if (status === "PUBLISHED") {
        return (
            <iframe
                src={previewUrl(slug)}
                title={`Preview of ${title}`}
                /* No scripts: the page's beacon must not count the desk as a visitor. */
                sandbox=""
                loading="lazy"
                className="w-full rounded-md border bg-white"
                style={{ height }}
                data-testid="landing-iframe"
            />
        );
    }
    return <BlockSummary blocks={blocks ?? []} theme={theme} />;
}

/** The blocks as stored, drawn plainly — the same five shapes the backend renders, without its styles. */
export function BlockSummary({ blocks, theme }: { blocks: LandingBlock[]; theme: LandingTheme | null }) {
    if (blocks.length === 0) return <p className="text-sm text-muted-foreground">The page has no blocks yet.</p>;
    return (
        <div className="mx-auto max-w-md space-y-4" style={{ fontFamily: theme?.font === "serif" ? "Georgia, serif" : undefined }} data-testid="landing-blocks">
            {blocks.map((block, index) => (
                <BlockPreview key={index} block={block} accent={theme?.primaryColor} />
            ))}
        </div>
    );
}

function BlockPreview({ block, accent }: { block: LandingBlock; accent: string | undefined }) {
    switch (block.type) {
        case "hero":
            return (
                <header className="space-y-2">
                    {block.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={block.imageUrl} alt="" className="aspect-[16/9] w-full rounded-md object-cover" />
                    )}
                    <h1 className="text-xl font-semibold text-foreground" style={{ color: accent }}>
                        {block.headline}
                    </h1>
                    {block.subheadline && <p className="text-sm text-muted-foreground">{block.subheadline}</p>}
                </header>
            );
        case "offer":
            return (
                <section className="rounded-md border p-4">
                    {block.highlight && (
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
                            {block.highlight}
                        </p>
                    )}
                    <h2 className="text-base font-semibold text-foreground">{block.title}</h2>
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{block.body}</p>
                </section>
            );
        case "cta":
            return (
                <div>
                    <span className="inline-flex rounded-md px-4 py-2 text-sm font-medium text-primary-foreground" style={{ backgroundColor: accent ?? "var(--primary)" }}>
                        {block.label}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">{block.href ? block.href : "Opens the contact form"}</p>
                </div>
            );
        case "contact":
            return (
                <section className="rounded-md border p-4 text-sm">
                    <h2 className="text-base font-semibold text-foreground">Contact</h2>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                        {block.phone && <li>{block.phone}</li>}
                        {block.email && <li>{block.email}</li>}
                        {block.address && <li>{block.address}</li>}
                        {block.hours && <li>{block.hours}</li>}
                        {block.note && <li>{block.note}</li>}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">{block.formEnabled ? "Name-and-phone form on" : "No form"}</p>
                </section>
            );
        case "gallery":
            return (
                <section className="grid grid-cols-3 gap-2">
                    {block.images.map((image, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={index} src={image.url} alt={image.alt ?? ""} className="aspect-square w-full rounded-md object-cover" />
                    ))}
                    {Array.from({ length: block.placeholders ?? 0 }).map((_, index) => (
                        <div key={`empty-${index}`} className="flex aspect-square items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                            empty frame
                        </div>
                    ))}
                </section>
            );
        default:
            return null;
    }
}
