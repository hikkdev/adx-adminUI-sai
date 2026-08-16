import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AccessDeniedPage() {
    return (
        <div className="flex min-h-[70vh] items-center justify-center">
            <Card className="w-full max-w-[454px] rounded-lg border-border p-8 shadow-none">
                <p className="text-metric text-foreground">403</p>
                <h1 className="mt-4 text-base font-semibold text-foreground">
                    You don&apos;t have access to this area
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                    Payout approvals are restricted to Finance Admins. Ask a Super Admin to
                    grant the Finance Approver role.
                </p>
                <div className="mt-6 flex items-center gap-2">
                    <Button>Request access</Button>
                    <Button variant="outline" asChild>
                        <Link href="/dashboard">Back to dashboard</Link>
                    </Button>
                </div>
            </Card>
        </div>
    );
}
