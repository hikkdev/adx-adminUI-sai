"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ERROR_REFERENCE = "ERR-7F3A21C9";

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const reference = error.digest ? `ERR-${error.digest.slice(0, 8).toUpperCase()}` : ERROR_REFERENCE;

    const copyReference = async () => {
        await navigator.clipboard.writeText(reference);
        toast.success("Reference copied");
    };

    return (
        <div className="flex min-h-[70vh] items-center justify-center">
            <Card className="w-full max-w-[520px] rounded-lg border-border p-8 shadow-none">
                <span className="inline-flex rounded-md bg-muted px-2.5 py-1 text-sm font-semibold text-foreground">
                    500
                </span>
                <h1 className="mt-4 text-base font-semibold text-foreground">
                    We couldn&apos;t load this page
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    The error has been logged and our team has been notified. Try again in a
                    moment.
                </p>
                <div className="mt-5 flex items-center gap-2">
                    <Button onClick={reset}>Retry</Button>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard">Back to dashboard</Link>
                    </Button>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-6 border-t pt-5">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Reference
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{reference}</code>
                            <button
                                type="button"
                                onClick={copyReference}
                                className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                Copy reference
                            </button>
                        </div>
                    </div>
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Time
                        </p>
                        <p className="mt-1.5 text-sm text-foreground">
                            {new Date().toLocaleString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                            })}{" "}
                            IST
                        </p>
                    </div>
                </div>
            </Card>
        </div>
    );
}
