import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The login behind a party — 2 Oct 2026 (the owner: "I don't see a lot of
 * users here reflected in the user list as if they're not linked at all").
 *
 * The directories and the KYC queues name the business ("Skyline Outdoor
 * Media"); Users names the person who signs in ("Vikram Rao"). A party page
 * says which person that is, linked to their account, and a party nobody
 * signs in for says so in a small muted word, on its page and on its KYC
 * queue row, so nobody goes looking for it under Users.
 */

export const NO_APP_ACCOUNT = "No app account";

/** The muted marker for a party with no login. */
export function NoAppAccount({ className }: { className?: string }) {
    return (
        <span className={cn("text-xs font-normal text-muted-foreground", className)} title="Nobody signs in to the ADX app for this account yet." data-testid="no-app-account">
            {NO_APP_ACCOUNT}
        </span>
    );
}

/** "Ravi Sharma", from the person block a party read carries; null when neither name is held. */
export function personNameOf(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null {
    const name = [person?.firstName, person?.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");
    return name || null;
}

/**
 * "Signs in as" on a party page: the person and their ADX-… id, linking to
 * their account under Users; the marker when no login backs the party.
 */
export function SignsInAs({ userId, name, displayId }: { userId: string | null | undefined; name: string | null | undefined; displayId: string | null | undefined }) {
    if (!userId) return <NoAppAccount />;
    const id = displayId?.trim();
    const label = [name?.trim() || null, id || null].filter(Boolean).join(" · ") || "Their account";
    return (
        <Link href={`/users/${encodeURIComponent(userId)}`} className="font-medium text-foreground underline-offset-4 hover:underline" data-testid="signs-in-as">
            {label}
        </Link>
    );
}
