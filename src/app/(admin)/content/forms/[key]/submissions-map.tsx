"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MapSurface, type MapPoint, type MapBounds } from "@/components/adx/map";
import { MapToneSwitch } from "@/components/adx/map-tone-switch";
import { useMapTone } from "@/lib/use-map-tone";
import { ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { cameraFor, cameraInto, type Camera } from "@/lib/map-geometry";
import { useDebounced } from "@/lib/use-debounced";
import { useMapsConfig } from "@/lib/use-maps-config";
import { formsService, type SubmissionMapPoint } from "@/services/forms";

/** The camera's rest: India, wide — the same rest the pin picker uses. */
const INDIA: Camera = { latitude: 21.5, longitude: 79, zoom: 4 };

/**
 * FM-1: the answers that carried a location, on the console's map surface.
 * The viewport is what the server is asked for (`?bbox=w,s,e,n`), once the
 * camera settles; a dot is one answer, a bubble many, and a click on a dot
 * names who answered and when.
 */
export function SubmissionsMap({ formKey }: { formKey: string }) {
    const { config } = useMapsConfig();
    const [camera, setCamera] = React.useState<Camera>(INDIA);
    const [tone, setTone] = useMapTone();
    const [bounds, setBounds] = React.useState<MapBounds | null>(null);
    const settled = useDebounced(bounds, 500);
    const [answer, setAnswer] = React.useState<{ key: string; points: SubmissionMapPoint[]; error: string | null } | null>(null);
    const [selected, setSelected] = React.useState<SubmissionMapPoint | null>(null);
    const fitted = React.useRef(false);

    const requestKey = settled ? `${formKey}|${settled.west.toFixed(4)},${settled.south.toFixed(4)},${settled.east.toFixed(4)},${settled.north.toFixed(4)}` : `${formKey}|world`;
    const loading = answer?.key !== requestKey;

    React.useEffect(() => {
        let active = true;
        const box = settled ?? { west: 68, south: 6, east: 98, north: 37 };
        formsService.submissionsMap(formKey, box).then(
            (points) => {
                if (!active) return;
                setAnswer({ key: requestKey, points, error: null });
                /* The first answer with anything in it frames the map; after that the operator's own pans are kept. */
                if (!fitted.current && points.length > 0) {
                    fitted.current = true;
                    const fit = cameraFor(points);
                    if (fit) setCamera(fit);
                }
            },
            (cause: unknown) => active && setAnswer({ key: requestKey, points: [], error: cause instanceof ApiError ? cause.message : "The map could not be read." }),
        );
        return () => {
            active = false;
        };
    }, [formKey, requestKey, settled]);

    const points = React.useMemo<(MapPoint & { row: SubmissionMapPoint })[]>(
        () => (answer?.points ?? []).map((row) => ({ id: row.id, latitude: row.latitude, longitude: row.longitude, tone: "info", title: row.contactName ?? "An answer", row })),
        [answer],
    );

    return (
        <Card className="overflow-hidden rounded-lg border-border shadow-none" data-testid="submissions-map">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                    {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {answer?.error ? <span className="text-danger">{answer.error}</span> : `${points.length} ${points.length === 1 ? "answer" : "answers"} with a location in view`}
                </span>
                {selected && (
                    <span className="text-foreground">
                        {selected.contactName ?? "An answer"} · {formatDateTime(selected.createdAt)}
                    </span>
                )}
            </div>
            <div className="relative h-[480px] w-full">
                <MapSurface
                    config={config}
                    tone={tone}
                    points={points}
                    camera={camera}
                    onCameraChange={setCamera}
                    selectedId={selected?.id ?? null}
                    onSelect={(point) => setSelected(point.row)}
                    onClusterClick={(cluster) => setCamera(cameraInto(cluster, camera.zoom + 2))}
                    onBoundsChange={setBounds}
                    caption="The answers that carried a location would be plotted here; the table has them all."
                />
                <MapToneSwitch tone={tone} onChange={setTone} className="absolute right-3 top-3 z-10" />
            </div>
        </Card>
    );
}
