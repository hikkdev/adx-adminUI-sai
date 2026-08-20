"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/adx/section-card";
import { FieldList } from "@/components/adx/simple-table";
import { StatusBadge } from "@/components/adx/status-badge";
import { formatINR } from "@/lib/format";
import type { PlatformUser } from "@/types";

/** Deterministic payroll fixture until the payroll service exists. */
const payrollFor = (user: PlatformUser) => {
    const seed = user.id.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const ctc = 35000 + (seed % 12) * 7500;
    return {
        ctc,
        account: `••••${String(4000 + (seed % 999)).padStart(4, "0")}`,
        ifsc: "HDFC0001234",
        pan: `•••••${String.fromCharCode(65 + (seed % 26))}${String(seed % 900 + 100)}•`,
        uan: `10${String(seed).padStart(10, "0")}`.slice(0, 12),
    };
};

export function UserPayrollCard({ user }: { user: PlatformUser }) {
    const [paused, setPaused] = React.useState(false);
    const payroll = payrollFor(user);

    return (
        <SectionCard
            title="Payroll"
            actions={
                <Button
                    variant="outline"
                    size="sm"
                    className="bg-card"
                    onClick={() => {
                        setPaused((value) => !value);
                        toast.success(
                            paused
                                ? `Payroll resumed for ${user.name}`
                                : `Payroll paused for ${user.name}`
                        );
                    }}
                >
                    {paused ? (
                        <>
                            <Play className="size-3.5" />
                            Resume
                        </>
                    ) : (
                        <>
                            <Pause className="size-3.5" />
                            Pause
                        </>
                    )}
                </Button>
            }
        >
            <FieldList
                items={[
                    [
                        "Status",
                        <StatusBadge
                            key="s"
                            status={
                                paused
                                    ? { label: "Paused", tone: "danger" }
                                    : { label: "Active", tone: "success" }
                            }
                        />,
                    ],
                    ["Monthly CTC", formatINR(payroll.ctc)],
                    ["Salary account", `${payroll.account} · ${payroll.ifsc}`],
                    ["PAN", payroll.pan],
                    ["PF UAN", payroll.uan],
                    ["City", user.city],
                    ["Payroll since", user.joinedAt],
                ]}
            />
        </SectionCard>
    );
}
