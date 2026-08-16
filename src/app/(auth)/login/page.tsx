"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleMark } from "@/components/adx/google-mark";

export default function LoginPage() {
    const router = useRouter();

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        router.push("/verify");
    };

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <span className="text-lg font-semibold tracking-tight">ADX.</span>

            <h1 className="mt-8 text-xl font-semibold tracking-tight text-foreground">
                Sign in to ADX Admin
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your @adx.co work email</p>

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
                    Continue with email
                </Button>
            </form>

            <div className="my-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or continue with</span>
                <div className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="h-11 w-full" type="button">
                <GoogleMark className="mr-2 size-4" />
                Continue with Google Workspace
            </Button>

            <div className="mt-4 text-center">
                <Link
                    href="/forgot-password"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                    Forgot password?
                </Link>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
                By continuing, you agree to the ADX Admin Terms of Use.
            </p>
        </Card>
    );
}
