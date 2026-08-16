import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFound() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
            <Card className="w-full max-w-[454px] rounded-lg border-border p-8 shadow-none">
                <p className="text-metric text-foreground">404</p>
                <h1 className="mt-4 text-base font-semibold text-foreground">
                    This page doesn&apos;t exist
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    The link may be outdated, or the record may have been removed.
                </p>
                <div className="mt-6">
                    <Button asChild>
                        <Link href="/dashboard">Back to dashboard</Link>
                    </Button>
                </div>
            </Card>
        </div>
    );
}
