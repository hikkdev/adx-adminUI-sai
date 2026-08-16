import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function SessionExpiredPage() {
    return (
        <Card className="w-full max-w-[454px] rounded-lg border-border p-6 shadow-none">
            <h1 className="text-base font-semibold text-foreground">Session expired</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
                You were signed out after 30 minutes of inactivity. Sign in again to pick up
                where you left off.
            </p>
            <div className="mt-5">
                <Button asChild>
                    <Link href="/login">Sign in again</Link>
                </Button>
            </div>
        </Card>
    );
}
