"use client";

import { SubNav } from "@/components/adx/sub-nav";

/**
 * Content's tabs (owner, 24 Sep 2026; PB-1, 27 Sep 2026).
 *
 * Everything ADX publishes to be read and nobody signs sits here. Pages is
 * the Studio index — every address the website answers and the apps can
 * open, laid out in Studio; Articles are the text pages the CMS held
 * (help articles, guides, news); Forms are the questions a page asks and
 * where the answers go; the thirteen policies the apps link to; the
 * layouts of the app homes; and the pictures everything draws with. The
 * contracts a party accepts or signs are Legal documents, a different
 * section, because signing is a different act with a record behind it.
 *
 * Every screen keeps its own route so a bookmark still lands; the tab bar
 * is what makes them read as one section.
 */
const NAV = [
    { label: "Pages", href: "/content", exact: true },
    { label: "Articles", href: "/content/articles" },
    { label: "Forms", href: "/content/forms" },
    { label: "Policies", href: "/content/policies" },
    /* LM-1 (27 Sep 2026): what each app screen draws, and the pictures it draws them with. */
    { label: "Layouts", href: "/content/layouts" },
    { label: "Media library", href: "/content/media" },
];

export function ContentNav() {
    return <SubNav items={NAV} />;
}
