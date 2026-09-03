import Script from "next/script";
import { apiConfig } from "@/lib/api-config";

export default function AuthLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
            {apiConfig.turnstileSiteKey && (
                <Script
                    src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                    strategy="afterInteractive"
                />
            )}
            {apiConfig.googleClientId && (
                <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
            )}
            {children}
        </div>
    );
}
