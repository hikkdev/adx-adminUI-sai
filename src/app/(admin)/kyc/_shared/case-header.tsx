import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface KycCaseHeaderProps {
    /** The queue the case belongs to — "Publisher KYC", "Advertiser KYC", … */
    backHref: string;
    backLabel: string;
    /** The small line over the name — "KYC review · advertiser". */
    eyebrow: string;
    title: string;
    /** The pills drawn after the name — the status, the open ask, the escalation, the age. */
    badges?: React.ReactNode;
    /** Lines under the name — the request, what a re-upload waits on. */
    children?: React.ReactNode;
    /** The desk's actions, top right. */
    actions?: React.ReactNode;
}

/**
 * The head of every KYC case page — the detail-page shell's back link and
 * heading row (`DetailShell`), with the eyebrow and the pills the case pages
 * add: the back link to the party's queue, the name with its pills, the
 * lines under it, and the desk's actions top right.
 */
export function KycCaseHeader({ backHref, backLabel, eyebrow, title, badges, children, actions }: KycCaseHeaderProps) {
    return (
        <div>
            <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <ChevronLeft className="size-4" />
                {backLabel}
            </Link>
            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
                        {badges}
                    </div>
                    {children}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
            </div>
        </div>
    );
}
