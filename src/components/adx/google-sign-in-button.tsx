"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { GoogleMark } from "./google-mark";

/**
 * "Continue with Google Workspace", backed by a real Google Identity Services
 * button.
 *
 * GIS only hands out an ID token from a click on a button *it* rendered — a
 * synthetic click on our own markup does not count. But its button cannot be
 * restyled to match this design system. So Google's button is rendered on top
 * at zero opacity and is the actual click target, while the ADX-styled surface
 * underneath is `aria-hidden` decoration. That keeps one focusable control (the
 * real one, with Google's own accessible name), one click target, and the
 * design intact.
 *
 * Two consequences of that trick are handled explicitly below, because both
 * would otherwise produce a button that *looks* fine and silently does nothing:
 *
 *   - GIS renders a fixed-height button (40px at size "large") inside a 44px
 *     wrapper, leaving dead strips top and bottom. The overlay is scaled to
 *     whatever height GIS actually produced, measured rather than assumed.
 *   - `accounts.google.com/gsi/client` is blocked by some ad-blockers and
 *     corporate proxies. Rather than polling forever behind a normal-looking
 *     button, this gives up after a timeout and says so.
 */

interface GoogleCredentialResponse {
    credential?: string;
}

interface GoogleIdApi {
    initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select?: boolean;
    }) => void;
    renderButton: (
        container: HTMLElement,
        options: {
            type?: "standard" | "icon";
            theme?: "outline" | "filled_blue" | "filled_black";
            size?: "small" | "medium" | "large";
            text?: "signin_with" | "signup_with" | "continue_with" | "signin";
            shape?: "rectangular" | "pill" | "circle" | "square";
            logo_alignment?: "left" | "center";
            width?: number;
        }
    ) => void;
}

declare global {
    interface Window {
        google?: { accounts?: { id?: GoogleIdApi } };
    }
}

interface GoogleSignInButtonProps {
    clientId: string;
    /** Called with Google's ID token; hand it to POST /auth/google. */
    onCredential: (idToken: string) => void;
    /** True while the ID token is being exchanged with the ADX backend. */
    busy?: boolean;
    /** True while another sign-in method on the page is mid-flight. */
    disabled?: boolean;
}

/* Google refuses to render below 200px and clamps above 400px. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/* How long to wait for accounts.google.com/gsi/client before giving up. */
const SCRIPT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 100;

type Status = "loading" | "ready" | "unavailable";

export function GoogleSignInButton({
    clientId,
    onCredential,
    busy,
    disabled,
}: GoogleSignInButtonProps) {
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const slotRef = React.useRef<HTMLDivElement>(null);
    const [status, setStatus] = React.useState<Status>("loading");

    /* onCredential is rebuilt on every parent render; keep it out of the effect
       deps so a re-render does not tear down and re-render Google's button. */
    const onCredentialRef = React.useRef(onCredential);
    React.useEffect(() => {
        onCredentialRef.current = onCredential;
    }, [onCredential]);

    React.useEffect(() => {
        let cancelled = false;
        let observer: ResizeObserver | undefined;
        let interval: ReturnType<typeof setInterval> | undefined;
        let giveUpAt: ReturnType<typeof setTimeout> | undefined;
        let frame: number | undefined;
        /* Last width passed to renderButton. The ResizeObserver fires an initial
           observation immediately and again on every frame of a resize drag;
           redrawing on each one would repeatedly destroy the click target, so
           only an actual width change redraws. */
        let drawnWidth = 0;

        const stop = () => {
            cancelled = true;
            if (interval !== undefined) clearInterval(interval);
            if (giveUpAt !== undefined) clearTimeout(giveUpAt);
            if (frame !== undefined) cancelAnimationFrame(frame);
            observer?.disconnect();
        };

        /* GIS's button is a fixed height that we do not control and that has
           changed across GIS versions. Measure what it actually rendered and
           stretch the (invisible) overlay to cover the full 44px, so there is
           no strip of the visible button that swallows clicks. */
        function matchOverlayHeight() {
            const wrapper = wrapperRef.current;
            const slot = slotRef.current;
            const rendered = slot?.firstElementChild as HTMLElement | null;
            if (!wrapper || !slot || !rendered) return;

            const renderedHeight = rendered.getBoundingClientRect().height;
            const wrapperHeight = wrapper.getBoundingClientRect().height;
            if (renderedHeight <= 0 || wrapperHeight <= 0) return;

            slot.style.transform =
                renderedHeight < wrapperHeight
                    ? `scaleY(${wrapperHeight / renderedHeight})`
                    : "";
        }

        function draw(api: GoogleIdApi) {
            const wrapper = wrapperRef.current;
            const slot = slotRef.current;
            if (!wrapper || !slot) return;

            const width = Math.round(
                Math.min(Math.max(wrapper.offsetWidth || MIN_WIDTH, MIN_WIDTH), MAX_WIDTH)
            );
            if (width === drawnWidth) return;
            drawnWidth = width;

            /* renderButton appends; clear first so a redraw replaces rather
               than stacks. */
            slot.innerHTML = "";
            slot.style.transform = "";
            api.renderButton(slot, {
                type: "standard",
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "rectangular",
                logo_alignment: "left",
                width,
            });

            /* GIS renders asynchronously, so the height is only measurable on a
               later frame. */
            if (frame !== undefined) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(matchOverlayHeight);
            });
        }

        function start() {
            const api = window.google?.accounts?.id;
            if (cancelled || !api || !wrapperRef.current) return false;

            api.initialize({
                client_id: clientId,
                callback: (response) => {
                    if (response.credential) onCredentialRef.current(response.credential);
                },
                /* One Tap is never prompted — prompt() is not called anywhere in
                   this component — so a session can only ever start from a real
                   click on the button below. auto_select is belt-and-braces for
                   anyone who adds One Tap later. */
                auto_select: false,
            });

            draw(api);
            setStatus("ready");

            /* Google's button takes a pixel width, so it must be redrawn when
               the card reflows. */
            observer = new ResizeObserver(() => draw(api));
            observer.observe(wrapperRef.current);
            return true;
        }

        if (!start()) {
            interval = setInterval(() => {
                if (start() && interval !== undefined) clearInterval(interval);
            }, POLL_INTERVAL_MS);

            /* Blocked script, offline, or a proxy that eats it. Stop polling and
               tell the user, instead of leaving a button that looks alive. */
            giveUpAt = setTimeout(() => {
                if (cancelled || window.google?.accounts?.id) return;
                if (interval !== undefined) clearInterval(interval);
                setStatus("unavailable");
            }, SCRIPT_TIMEOUT_MS);
        }

        return stop;
    }, [clientId]);

    if (status === "unavailable") {
        return (
            <div
                role="alert"
                className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-center text-xs text-muted-foreground"
            >
                Google sign-in could not load. Check your connection or ad blocker, or sign in
                with your email and password above.
            </div>
        );
    }

    /* Blocks the mouse AND the keyboard: pointer-events alone would leave
       Google's button tabbable and Enter-activatable, letting a second sign-in
       fire while the first is still in flight. */
    const locked = !!busy || !!disabled || status !== "ready";

    return (
        <div
            ref={wrapperRef}
            aria-busy={busy || undefined}
            className={cn(
                "group relative h-11 w-full overflow-hidden rounded-md ring-offset-background",
                /* The focusable element is Google's, inside this box, so the
                   ring has to come from the wrapper. */
                "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                (busy || disabled) && "opacity-50"
            )}
        >
            {/* What the user sees. Decoration only — the real control is the
                transparent Google button layered above it. */}
            <div
                aria-hidden
                className={cn(
                    "pointer-events-none flex h-11 w-full items-center justify-center gap-2",
                    "rounded-md border border-input bg-background text-sm font-medium",
                    "transition-colors",
                    !locked && "group-hover:bg-accent"
                )}
            >
                <GoogleMark className="size-4" />
                {busy ? "Signing in…" : "Continue with Google Workspace"}
            </div>

            {/* Google's own button: invisible, on top, and the only thing that
                can actually mint an ID token. `inert` while locked so it is
                neither clickable nor reachable by Tab. */}
            <div
                ref={slotRef}
                inert={locked || undefined}
                className={cn(
                    "absolute inset-0 flex items-center justify-center opacity-0",
                    locked && "pointer-events-none"
                )}
            />
        </div>
    );
}
