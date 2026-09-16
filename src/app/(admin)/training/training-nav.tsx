import { PlugZap } from "lucide-react";
import { EmptyState } from "@/components/adx/empty-state";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";

/** The desk's heading, shared by the live screens and the offline card. */
export const TRAINING_TITLE = "Training";
export const TRAINING_SUBTITLE = "The curriculum agents pass to be certified, and the library both apps read";

/**
 * Section tabs shared by the Training pages.
 *
 * No DR 10 frame covers the desk — the frames draw the agent's side of the
 * curriculum, not the screen that writes it — so this borrows the Growth
 * CMS idiom: one rail row, three screens behind a SubNav. Modules is the
 * curriculum the row opens; Certifications is who has passed it;
 * Library is the flat list of resources that predates it.
 */
export function TrainingNav() {
    return (
        <SubNav
            items={[
                { label: "Modules", href: "/training", exact: true },
                { label: "Certifications", href: "/training/certifications" },
                { label: "Library", href: "/training/library" },
            ]}
        />
    );
}

/**
 * What the Training pages show with the API off.
 *
 * There is nothing to fall back to and nothing was removed to get here: no
 * seed file has ever described a module, a question or a certificate. A
 * module is on every agent's index the moment it is active and a certificate
 * is a record with a minted ADX-CERT identifier; a seeded one would be a
 * qualification nobody earned.
 */
export function TrainingOffline() {
    return (
        <div className="space-y-5">
            <PageHeader title={TRAINING_TITLE} subtitle={TRAINING_SUBTITLE} />
            <TrainingNav />
            <EmptyState
                icon={PlugZap}
                title="Training reads the API"
                description="This console is running on fixtures, and there are no training fixtures — the modules, their questions and the certificates are read from the ADX backend's training module. Set NEXT_PUBLIC_USE_API=true and point NEXT_PUBLIC_API_BASE_URL at the backend to work the curriculum."
            />
        </div>
    );
}
