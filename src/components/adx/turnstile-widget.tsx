"use client";

import * as React from "react";

declare global {
    interface Window {
        turnstile?: {
            render: (
                container: HTMLElement,
                options: {
                    sitekey: string;
                    callback: (token: string) => void;
                    "expired-callback"?: () => void;
                    "error-callback"?: () => void;
                }
            ) => string;
        };
    }
}

interface TurnstileWidgetProps {
    siteKey: string;
    onVerify: (token: string | null) => void;
}

/**
 * Renders a Cloudflare Turnstile challenge. The loader script lives in the
 * (auth) layout; this polls for `window.turnstile` since the script can
 * finish loading after this component mounts (e.g. client-side navigation
 * between /login and /forgot-password reuses the already-loading script).
 */
export function TurnstileWidget({ siteKey, onVerify }: TurnstileWidgetProps) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const renderedRef = React.useRef(false);

    React.useEffect(() => {
        let cancelled = false;

        function render() {
            if (cancelled || renderedRef.current || !containerRef.current || !window.turnstile) return;
            renderedRef.current = true;
            window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token) => onVerify(token),
                "expired-callback": () => onVerify(null),
                "error-callback": () => onVerify(null),
            });
        }

        if (window.turnstile) {
            render();
            return;
        }

        const interval = setInterval(() => {
            if (window.turnstile) {
                clearInterval(interval);
                render();
            }
        }, 100);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [siteKey, onVerify]);

    return <div ref={containerRef} />;
}
