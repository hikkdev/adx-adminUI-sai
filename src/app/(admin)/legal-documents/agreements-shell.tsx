"use client";

import { PlugZap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/adx/page-header";
import { SubNav } from "@/components/adx/sub-nav";
import { isLive } from "@/lib/api-config";

interface AgreementsShellProps {
    actions?: React.ReactNode;
    children: React.ReactNode;
}

const NAV = [
    { label: "Templates", href: "/legal-documents", exact: true },
    { label: "Signed and accepted", href: "/legal-documents/acceptances" },
    { label: "Stale terms", href: "/legal-documents/stale" },
    { label: "Signatures", href: "/legal-documents/signatures" },
];

/**
 * Page frame for the two agreement screens, and the one thing they share: a
 * refusal to render an agreement nobody published.
 *
 * Other console domains fall back to fixtures so screens work without a
 * server. These do not. A template here is legal text a party clicks through,
 * and a seeded one would look exactly like a real one to the person deciding
 * whether the terms are ready. Saying "not connected" is the honest answer.
 */
export function AgreementsShell({ actions, children }: AgreementsShellProps) {
    return (
        <div className="space-y-5">
            <PageHeader
                title="Legal documents"
                subtitle="The contracts each party accepts or signs — a publisher listing a spot, a print partner, an employee, an agent, an advertiser with a paid campaign — versioned, with the record of who accepted which version and when. Policies nobody signs live under Content."
                actions={actions}
            />
            <SubNav items={NAV} />
            {isLive("agreements") ? (
                children
            ) : (
                <Card className="rounded-lg border-border p-8 text-center shadow-none">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                        <PlugZap className="size-6 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                        Not connected to the ADX backend
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                        Agreements are the text a publisher or advertiser clicks through and the record
                        that they did. There is no seeded stand-in, because a fixture agreement would look
                        exactly like a published one. Set{" "}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_USE_API=true</code>{" "}
                        and point the console at a running backend.
                    </p>
                </Card>
            )}
        </div>
    );
}
