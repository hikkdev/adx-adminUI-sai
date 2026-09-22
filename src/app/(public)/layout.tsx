/**
 * LH7: the public pages — no session, no console chrome. The invite landing
 * behind `adx.in/j/<code>` lives here; it draws its own mobile-first page
 * in both themes and reads the API anonymously (the code is the key).
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <>{children}</>;
}
