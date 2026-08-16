/** Route-level skeleton shown while a page's data resolves. */
export default function AdminLoading() {
    return (
        <div className="animate-pulse space-y-5" aria-busy aria-label="Loading">
            <div className="space-y-2">
                <div className="h-7 w-52 rounded-md bg-muted" />
                <div className="h-4 w-72 rounded-md bg-muted/70" />
            </div>
            <div className="flex items-center gap-2">
                <div className="h-9 w-[260px] rounded-md bg-muted" />
                <div className="h-9 w-32 rounded-md bg-muted/70" />
                <div className="ml-auto h-9 w-28 rounded-md bg-muted/70" />
            </div>
            <div className="overflow-hidden rounded-lg border bg-card">
                <div className="h-9 border-b bg-muted/50" />
                {Array.from({ length: 8 }).map((_, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0"
                    >
                        <div className="size-6 rounded-full bg-muted" />
                        <div className="h-4 w-44 rounded bg-muted" />
                        <div className="h-4 w-32 rounded bg-muted/70" />
                        <div className="h-5 w-20 rounded-full bg-muted/70" />
                        <div className="ml-auto h-4 w-24 rounded bg-muted/70" />
                    </div>
                ))}
            </div>
        </div>
    );
}
