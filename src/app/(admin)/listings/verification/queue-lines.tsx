import Link from "next/link";

/**
 * The two lines under a "running out" queue's header — Verification (the
 * photo re-check) and Renewals (the lease, licence or permit) share them so
 * the two pages read alike (3 Oct 2026, the owner: "There's some lapsed ones
 * but it doesn't show in renewals tab"):
 *
 *   the pointer to the other desk, so nobody looks for one in the other;
 *   the one-line summary that stands where the number cards were.
 */
export function QueueLines({
    crossLink,
    summary,
}: {
    crossLink: { lead: string; label: string; href: string };
    summary: string;
}) {
    return (
        <div className="-mt-3 space-y-1 text-sm">
            <p className="text-muted-foreground" data-testid="queue-cross-link">
                {crossLink.lead}{" "}
                <Link href={crossLink.href} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                    {crossLink.label}
                </Link>
                .
            </p>
            <p className="font-medium text-foreground" data-testid="queue-summary">
                {summary}
            </p>
        </div>
    );
}
