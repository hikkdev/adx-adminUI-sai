import type { Metadata } from "next";
import { IBM_Plex_Sans_Condensed, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth";
import { BrandProvider } from "@/components/adx/brand";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-sans",
});

const plexCondensed = IBM_Plex_Sans_Condensed({
    subsets: ["latin"],
    weight: ["500", "600"],
    variable: "--font-metric",
});

export const metadata: Metadata = {
    title: {
        default: "ADX Admin",
        template: "%s · ADX Admin",
    },
    description: "Operations console for the ADX out-of-home advertising marketplace.",
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html lang="en">
            <body className={`${inter.variable} ${plexCondensed.variable} font-sans`}>
                {/* QR-9: the brand — DR 11, or Settings › Branding's — on every surface, before sign-in too. */}
                <BrandProvider>
                    <AuthProvider>{children}</AuthProvider>
                </BrandProvider>
                <Toaster position="bottom-right" richColors closeButton />
            </body>
        </html>
    );
}
