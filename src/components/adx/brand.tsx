"use client";

import * as React from "react";
import { BRAND_FALLBACK, brandingService, hexToHslTriple, type Brand } from "@/services/branding";

/**
 * QR-9: the brand on every console surface.
 *
 * `BrandProvider` reads `GET /app/branding` once on load (DR 11 until the
 * read answers), sets the primary colour as the CSS variables shadcn's
 * theme reads, and hands the brand to `useBrand()`. `Wordmark` and `Mark`
 * draw the current logos; `reload()` after a publish on Settings › Brand &
 * theme (QR-11) re-reads and re-paints without a page load.
 */

type BrandContextValue = { brand: Brand; reload: () => Promise<void> };

/** What layout.tsx writes as the tab title's suffix — the brand's console title replaces it at run time. */
export const CONSOLE_TITLE_STATIC = "ADX Admin";

const BrandContext = React.createContext<BrandContextValue>({ brand: BRAND_FALLBACK, reload: async () => undefined });

/** The CSS variables the theme reads, from the brand's colours. QR-11: what is written on the primary rides along. */
export function brandCssVariables(brand: Pick<Brand, "primaryColor"> & Partial<Pick<Brand, "onPrimaryColor">>): Record<string, string> {
    const primary = hexToHslTriple(brand.primaryColor);
    if (!primary) return {};
    const onPrimary = brand.onPrimaryColor ? hexToHslTriple(brand.onPrimaryColor) : null;
    return { "--primary": primary, "--ring": primary, ...(onPrimary ? { "--primary-foreground": onPrimary } : {}) };
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
    const [brand, setBrand] = React.useState<Brand>(BRAND_FALLBACK);

    const reload = React.useCallback(async () => {
        try {
            setBrand(await brandingService.current());
        } catch {
            // Offline, or a backend older than QR-9: DR 11 from the bundled files.
            setBrand(BRAND_FALLBACK);
        }
    }, []);

    React.useEffect(() => {
        // The first read; a late answer after unmount is dropped.
        let active = true;
        void (async () => {
            try {
                const next = await brandingService.current();
                if (active) setBrand(next);
            } catch {
                // Offline, or a backend older than QR-9: DR 11 stays.
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    React.useEffect(() => {
        const root = document.documentElement;
        const variables = brandCssVariables(brand);
        for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
        return () => {
            for (const name of Object.keys(variables)) root.style.removeProperty(name);
        };
    }, [brand]);

    // QR-12: the tab reads "Page · <console title>". Next writes the static
    // "ADX Admin" from layout.tsx on every navigation; this swaps the suffix
    // for the brand's each time the title changes, and does nothing while the
    // brand's title IS the static one.
    React.useEffect(() => {
        const wanted = brand.console.title;
        if (!wanted || wanted === CONSOLE_TITLE_STATIC) return;
        const retitle = () => {
            const current = document.title;
            const next = current === CONSOLE_TITLE_STATIC ? wanted : current.endsWith(` · ${CONSOLE_TITLE_STATIC}`) ? `${current.slice(0, -CONSOLE_TITLE_STATIC.length)}${wanted}` : current;
            if (next !== current) document.title = next;
        };
        retitle();
        const title = document.querySelector("title");
        const observer = title ? new MutationObserver(retitle) : null;
        if (title && observer) observer.observe(title, { childList: true, characterData: true, subtree: true });
        return () => observer?.disconnect();
    }, [brand.console.title]);

    const value = React.useMemo(() => ({ brand, reload }), [brand, reload]);
    return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
    return React.useContext(BrandContext);
}

/** The wordmark — "ADX" in DR 11's angular letters, or whatever the console uploaded — at a height. */
export function Wordmark({ height = 20, inverse = false, className }: { height?: number; inverse?: boolean; className?: string }) {
    const { brand } = useBrand();
    return (
        // eslint-disable-next-line @next/next/no-img-element -- an SVG the backend serves; next/image adds nothing to it.
        <img
            src={inverse ? brand.wordmarkInverseUrl : brand.wordmarkUrl}
            alt={brand.platformName}
            height={height}
            style={{ height, width: "auto" }}
            className={className}
            data-testid="brand-wordmark"
        />
    );
}

/** The mark — the "A" glyph — at a size. */
export function Mark({ size = 24, inverse = false, className }: { size?: number; inverse?: boolean; className?: string }) {
    const { brand } = useBrand();
    return (
        // eslint-disable-next-line @next/next/no-img-element -- an SVG the backend serves.
        <img
            src={inverse ? brand.markInverseUrl : brand.markUrl}
            alt=""
            aria-hidden
            height={size}
            style={{ height: size, width: "auto" }}
            className={className}
            data-testid="brand-mark"
        />
    );
}
