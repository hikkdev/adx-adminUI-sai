"use client";

import * as React from "react";
import { mix, type Brand } from "@/services/branding";

/**
 * QR-11 — the three surfaces, drawn from whatever the form holds right now.
 *
 * Pure: a `Brand` in, a picture out. The phone frame is DR 09's pieces (app
 * bar, greeting, a primary button, chips, the tab bar with the FAB), the
 * console frame its header and a card, the website frame DR 11's dark hero.
 * Nothing here is the real component — these are the shapes the colours
 * land on, so a change reads at a glance before it is published.
 */

const soft = (b: Brand) => mix("#FFFFFF", b.primaryColor, 0.08);

export function PhonePreview({ brand }: { brand: Brand }) {
    return (
        <div
            className="mx-auto w-[240px] overflow-hidden rounded-[28px] border-[6px] border-neutral-900 bg-white shadow-md"
            style={{ background: brand.groundColor, color: brand.inkColor }}
            data-testid="preview-phone"
        >
            <div className="flex items-center justify-between px-4 pt-2 text-[9px]" style={{ color: brand.inkColor }}>
                <span>9:41</span>
                <span>●●●</span>
            </div>
            <div className="mt-1 flex items-center gap-2 bg-white px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- the brand's own file */}
                <img src={brand.markUrl} alt="" aria-hidden style={{ height: 14 }} />
                <div className="h-5 flex-1 rounded-full bg-neutral-100" />
                <div className="size-5 rounded-full" style={{ background: brand.deepColor }} />
            </div>
            <div className="px-3 pt-3">
                <p className="text-[13px] font-semibold leading-tight">Good morning, Asha</p>
                <p className="text-[9px] text-neutral-500">Your listing performance today</p>
                <div className="mt-2 flex gap-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[8px] font-medium" style={{ background: soft(brand), color: brand.primaryColor }}>
                        Live
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-[8px] text-neutral-500">Paused</span>
                    <span className="rounded-full border px-2 py-0.5 text-[8px] text-neutral-500">Draft</span>
                </div>
                <div className="mt-3 rounded-lg bg-white p-2.5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold">Complete your profile</span>
                        <span className="text-[11px] font-bold" style={{ color: brand.primaryColor }} data-testid="preview-phone-accent">
                            70%
                        </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-neutral-200">
                        <div className="h-1.5 w-[70%] rounded-full" style={{ background: brand.primaryColor }} />
                    </div>
                    <div
                        className="mt-2.5 rounded-md py-1.5 text-center text-[9px] font-semibold"
                        style={{ background: brand.primaryColor, color: brand.onPrimaryColor }}
                        data-testid="preview-phone-button"
                    >
                        Verify your identity
                    </div>
                </div>
            </div>
            <div className="relative mt-4 flex items-end justify-between bg-white px-3 pb-2 pt-3 text-[7px]">
                {["Home", "Calendar", "", "Bookings", "Assist"].map((label, i) =>
                    label ? (
                        <div key={label} className="flex flex-col items-center gap-0.5" style={{ color: i === 0 ? brand.primaryColor : "#8A8A94" }}>
                            <div className="size-3 rounded-sm" style={{ background: i === 0 ? brand.primaryColor : "#C9C9D1" }} />
                            <span className={i === 0 ? "font-semibold" : ""}>{label}</span>
                        </div>
                    ) : (
                        <div key="fab" className="w-8" />
                    ),
                )}
                <div
                    className="absolute left-1/2 top-[-14px] flex size-9 -translate-x-1/2 items-center justify-center rounded-full text-base font-light shadow"
                    style={{ background: brand.primaryColor, color: brand.onPrimaryColor, boxShadow: `0 0 0 6px ${soft(brand)}` }}
                    data-testid="preview-phone-fab"
                >
                    +
                </div>
            </div>
        </div>
    );
}

export function ConsolePreview({ brand }: { brand: Brand }) {
    return (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm" data-testid="preview-console">
            <div className="flex items-center gap-3 border-b bg-white px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- the brand's own file */}
                <img src={brand.wordmarkUrl} alt={brand.platformName} style={{ height: 12 }} data-testid="preview-console-wordmark" />
                <div className="ml-2 flex gap-2 text-[9px] text-neutral-500">
                    <span className="font-semibold" style={{ color: brand.primaryColor }}>
                        Dashboard
                    </span>
                    <span>Listings</span>
                    <span>Campaigns</span>
                    <span>Settings</span>
                </div>
                <div className="ml-auto size-4 rounded-full" style={{ background: brand.deepColor }} />
            </div>
            <div className="p-3" style={{ background: brand.groundColor }}>
                <div className="rounded-md border bg-white p-2.5">
                    <p className="text-[10px] font-semibold" style={{ color: brand.inkColor }}>
                        Listings awaiting review
                    </p>
                    <p className="mt-0.5 text-[8px] text-neutral-500">
                        12 spots in the queue —{" "}
                        <span className="underline" style={{ color: brand.primaryColor }}>
                            open the desk
                        </span>
                    </p>
                    <div className="mt-2 flex gap-1.5">
                        <span
                            className="rounded px-2 py-1 text-[8px] font-semibold"
                            style={{ background: brand.primaryColor, color: brand.onPrimaryColor }}
                            data-testid="preview-console-button"
                        >
                            Review now
                        </span>
                        <span className="rounded border px-2 py-1 text-[8px] font-medium" style={{ color: brand.primaryColor, borderColor: brand.primaryColor }}>
                            Later
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function WebsitePreview({ brand }: { brand: Brand }) {
    const hero = brand.website.heroImageUrl;
    return (
        <div
            className="relative overflow-hidden rounded-lg border shadow-sm"
            style={{
                background: hero ? `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.55)), url(${hero}) center/cover` : brand.inkColor,
                color: "#FFFFFF",
            }}
            data-testid="preview-website"
        >
            <div className="flex items-center justify-between px-4 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element -- the brand's own file */}
                <img src={brand.wordmarkInverseUrl} alt={brand.platformName} style={{ height: 12 }} />
                <div className="flex gap-2 text-[8px] text-white/70">
                    <span>Advertise</span>
                    <span>List a space</span>
                    <span>Agents</span>
                </div>
            </div>
            <div className="px-4 pb-5 pt-3">
                <p className="text-[18px] font-extrabold leading-tight" data-testid="preview-website-tagline">
                    {brand.website.taglines[0] ?? brand.tagline}
                </p>
                <p className="mt-1 text-[9px] text-white/70">Real-world ad space, booked like a room.</p>
                <div className="mt-3 flex gap-1.5">
                    <span className="rounded px-2.5 py-1 text-[8px] font-semibold" style={{ background: brand.primaryColor, color: brand.onPrimaryColor }}>
                        Find a spot
                    </span>
                    <span className="rounded border border-white/40 px-2.5 py-1 text-[8px] font-medium">List yours</span>
                </div>
            </div>
            <div className="absolute bottom-2 right-3 flex gap-1">
                {brand.website.taglines.map((_, i) => (
                    <span key={i} className="size-1 rounded-full" style={{ background: i === 0 ? brand.primaryColor : "rgba(255,255,255,.4)" }} />
                ))}
            </div>
        </div>
    );
}
