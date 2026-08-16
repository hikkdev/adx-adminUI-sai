"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CODE_LENGTH = 6;

export default function TwoFactorPage() {
    const router = useRouter();
    const [digits, setDigits] = React.useState<string[]>(Array(CODE_LENGTH).fill(""));
    const inputsRef = React.useRef<(HTMLInputElement | null)[]>([]);

    const handleChange = (index: number, value: string) => {
        const digit = value.replace(/\D/g, "").slice(-1);
        setDigits((current) => {
            const next = [...current];
            next[index] = digit;
            return next;
        });
        if (digit && index < CODE_LENGTH - 1) {
            inputsRef.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Backspace" && !digits[index] && index > 0) {
            inputsRef.current[index - 1]?.focus();
        }
    };

    const handlePaste = (event: React.ClipboardEvent) => {
        const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
        if (!pasted) return;
        event.preventDefault();
        setDigits(pasted.split("").concat(Array(CODE_LENGTH - pasted.length).fill("")));
        inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (digits.some((digit) => !digit)) {
            toast.error("Enter the full 6-digit code.");
            return;
        }
        router.push("/dashboard");
    };

    return (
        <Card className="w-full max-w-[424px] rounded-lg border-border p-8 shadow-none">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Two-factor verification
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">p****@adx.co.in</p>

            <form onSubmit={handleSubmit}>
                <div className="mt-3 flex gap-2" onPaste={handlePaste}>
                    {digits.map((digit, index) => (
                        <input
                            key={index}
                            ref={(element) => {
                                inputsRef.current[index] = element;
                            }}
                            value={digit}
                            onChange={(event) => handleChange(index, event.target.value)}
                            onKeyDown={(event) => handleKeyDown(index, event)}
                            inputMode="numeric"
                            autoComplete={index === 0 ? "one-time-code" : "off"}
                            aria-label={`Digit ${index + 1}`}
                            className={cn(
                                "h-11 w-10 rounded-md border bg-card text-center text-lg font-semibold text-foreground",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            )}
                        />
                    ))}
                </div>

                <Button type="submit" className="mt-6 h-11 w-full">
                    Verify and continue
                </Button>
            </form>

            <button
                type="button"
                onClick={() => toast.success("A new code is on its way.")}
                className="mt-4 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
                Resend code
            </button>
        </Card>
    );
}
