"use client";

import * as React from "react";
import { Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/adx/page-header";
import { SectionCard } from "@/components/adx/section-card";
import { StatusBadge } from "@/components/adx/status-badge";
import { currentAdmin } from "@/data/platform";

const sessions = [
    { device: "MacBook Pro", location: "Bengaluru, Karnataka", lastSeen: "Active now", current: true, icon: Laptop },
    { device: "iPhone 15", location: "Mumbai, Maharashtra", lastSeen: "2 hours ago", current: false, icon: Smartphone },
    { device: "Dell Latitude", location: "Gurugram, Haryana", lastSeen: "3 days ago", current: false, icon: Laptop },
];

const notificationPrefs = [
    ["KYC submissions", "Email me when a publisher submits documents for review"],
    ["Dispute escalations", "Alert me when a dispute breaches its SLA"],
    ["Payout batch results", "Daily digest of settled and failed payouts"],
    ["Weekly platform summary", "Sent every Monday at 9:00 AM IST"],
] as const;

export function AccountView() {
    const [dirty, setDirty] = React.useState(false);

    return (
        <div className="mx-auto max-w-3xl space-y-5">
            <PageHeader title="My account" subtitle="Profile, security, and notification preferences" />

            <SectionCard title="Profile">
                <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="acc-name">Full name</Label>
                        <Input
                            id="acc-name"
                            defaultValue={currentAdmin.name}
                            onChange={() => setDirty(true)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="acc-email">Email</Label>
                        <Input id="acc-email" defaultValue={currentAdmin.email} disabled />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="acc-phone">Phone</Label>
                        <Input
                            id="acc-phone"
                            defaultValue={currentAdmin.phone}
                            onChange={() => setDirty(true)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Role</Label>
                        <p className="flex h-10 items-center text-sm text-muted-foreground">
                            {currentAdmin.role}, assigned by the Super Admin
                        </p>
                    </div>
                </div>
                {dirty && (
                    <div className="mt-5 flex justify-end gap-2 border-t pt-4">
                        <Button variant="outline" onClick={() => setDirty(false)}>
                            Discard
                        </Button>
                        <Button
                            onClick={() => {
                                setDirty(false);
                                toast.success("Profile updated");
                            }}
                        >
                            Save changes
                        </Button>
                    </div>
                )}
            </SectionCard>

            <SectionCard title="Password">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-foreground">Password</p>
                        <p className="text-xs text-muted-foreground">
                            Last changed {currentAdmin.passwordChanged}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        className="bg-card"
                        onClick={() => toast.info("A change-password link was sent to your email.")}
                    >
                        Change password
                    </Button>
                </div>
            </SectionCard>

            <SectionCard
                title="Two-factor authentication"
                description="Required on every admin sign-in"
            >
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-md bg-success-soft">
                            <ShieldCheck className="size-4 text-success" />
                        </span>
                        <div>
                            <p className="text-sm font-medium text-foreground">Authenticator app</p>
                            <p className="text-xs text-muted-foreground">
                                Registered {currentAdmin.twoFactorRegisteredAt}
                            </p>
                        </div>
                    </div>
                    <StatusBadge status={{ label: "Verified", tone: "success" }} />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <p className="text-xs text-muted-foreground">
                        {currentAdmin.recoveryCodesUnused} of 10 recovery codes unused
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card"
                        onClick={() => toast.info("Recovery codes require a fresh 2FA check to view.")}
                    >
                        View recovery codes
                    </Button>
                </div>
            </SectionCard>

            <SectionCard
                title="Active sessions"
                footer={
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 bg-card text-danger hover:text-danger"
                        onClick={() => toast.success("All other sessions revoked")}
                    >
                        Revoke all other sessions
                    </Button>
                }
            >
                <ul className="divide-y">
                    {sessions.map((session) => (
                        <li
                            key={session.device}
                            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                        >
                            <div className="flex items-center gap-3">
                                <span className="flex size-9 items-center justify-center rounded-md bg-muted">
                                    <session.icon className="size-4 text-muted-foreground" />
                                </span>
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {session.device}
                                        {session.current && (
                                            <span className="ml-2 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                                                This device
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {session.location} · {session.lastSeen}
                                    </p>
                                </div>
                            </div>
                            {!session.current && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-danger hover:text-danger"
                                    onClick={() => toast.success(`${session.device} signed out`)}
                                >
                                    Revoke
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            </SectionCard>

            <SectionCard title="Notification preferences">
                <div className="space-y-4">
                    {notificationPrefs.map(([title, helper]) => (
                        <label key={title} className="flex items-center justify-between gap-4">
                            <span>
                                <span className="block text-sm font-medium text-foreground">{title}</span>
                                <span className="block text-xs text-muted-foreground">{helper}</span>
                            </span>
                            <Switch
                                defaultChecked={title !== "Weekly platform summary"}
                                onCheckedChange={() => toast.success("Preference saved")}
                            />
                        </label>
                    ))}
                </div>
            </SectionCard>
        </div>
    );
}
