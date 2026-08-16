"use client";

import Link from "next/link";
import { AtSign } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        toast.success("Reset link sent", {
            description: "Check your inbox for the password reset email.",
        });
    };

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <span className="text-lg font-semibold tracking-tight">ADX.</span>

            <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
                Reset your password
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Enter your work email and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="email">Work email</Label>
                    <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="email"
                            type="email"
                            required
                            placeholder="name@adx.co"
                            className="h-11 pl-9"
                            autoComplete="email"
                        />
                    </div>
                </div>
                <Button type="submit" className="h-11 w-full">
                    Send reset link
                </Button>
            </form>

            <div className="mt-6 text-center">
                <Link
                    href="/login"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                    Back to sign in
                </Link>
            </div>
        </Card>
    );
}
