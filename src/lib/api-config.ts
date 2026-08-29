/**
 * Backend wiring.
 *
 * The admin ships with seeded fixtures so every screen renders without a
 * server. Set NEXT_PUBLIC_USE_API=true (and point NEXT_PUBLIC_API_BASE_URL at
 * the ADX backend) to read and write against the real API instead.
 */
export const apiConfig = {
    baseUrl: (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1").replace(
        /\/$/,
        ""
    ),
    /** When false, auth and data calls resolve from fixtures. */
    live: process.env.NEXT_PUBLIC_USE_API === "true",
    /** Cloudflare Turnstile site key. Unset means the widget doesn't render — the
     *  backend's captcha check no-ops the same way when its secret key is unset. */
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null,
} as const;
