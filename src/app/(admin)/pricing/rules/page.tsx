import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { api } from "@/services";
import { RuleBuilder } from "./rule-builder";

export const metadata: Metadata = { title: "Rule Builder" };

export default async function RuleBuilderPage() {
    const rule = await api.pricing.rule();
    return (
        <div className="space-y-4">
            <Link
                href="/pricing/model#rules"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                <ChevronLeft className="size-4" />
                Pricing model
            </Link>
            <RuleBuilder rule={rule} />
        </div>
    );
}
