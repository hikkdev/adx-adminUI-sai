export default function AuthLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
            {children}
        </div>
    );
}
