/**
 * The geometry the console's map surface shares with any screen that draws
 * markers — G13-C, alongside `components/adx/map.tsx` (the seam). Nothing
 * here knows a vendor: a point is a latitude and a longitude, a camera is a
 * centre and a zoom, and the clustering is a grid the test can pin.
 */

export interface Placed {
    id: string;
    latitude: number;
    longitude: number;
}

/** Past this zoom every point is its own marker; below it, points in the same grid cell fold into one bubble. */
export const CLUSTER_UNTIL_ZOOM = 15;

/** The camera's limits: wide enough for the country, close enough for a street. */
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

/** One bubble on the map: a single point, or several folded into one at this zoom. */
export interface MarkerCluster<T extends Placed = Placed> {
    key: string;
    latitude: number;
    longitude: number;
    points: T[];
}

export interface Camera {
    latitude: number;
    longitude: number;
    zoom: number;
}

export const meanOf = <T extends Placed>(points: readonly T[]): { latitude: number; longitude: number } => ({
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
});

/** The side of a grid cell, in degrees, at a zoom: about 6.5 km at 10, 1.6 km at 12, 400 m at 14. */
export const cellSizeAt = (zoom: number): number => 60 / 2 ** zoom;

/**
 * The points folded into grid cells sized by the zoom — a library-free
 * clustering the test can pin. Each cell's bubble sits on the mean of its
 * points, and a cell with one point is that point's own marker. At or
 * past `CLUSTER_UNTIL_ZOOM` nothing folds. Bubbles come largest first so a
 * crowded cell is drawn over a lone marker rather than under it.
 */
export function markerClusters<T extends Placed>(points: readonly T[], zoom: number): MarkerCluster<T>[] {
    if (zoom >= CLUSTER_UNTIL_ZOOM) {
        return points.map((point) => ({ key: point.id, latitude: point.latitude, longitude: point.longitude, points: [point] }));
    }
    const cell = cellSizeAt(zoom);
    const cells = new Map<string, T[]>();
    for (const point of points) {
        const key = `${Math.floor(point.latitude / cell)}:${Math.floor(point.longitude / cell)}`;
        const bucket = cells.get(key) ?? [];
        bucket.push(point);
        cells.set(key, bucket);
    }
    return [...cells.entries()]
        .map(([key, members]) =>
            members.length === 1
                ? { key: members[0].id, latitude: members[0].latitude, longitude: members[0].longitude, points: members }
                : { key: `cell:${key}`, points: members, ...meanOf(members) },
        )
        .sort((a, b) => b.points.length - a.points.length || a.key.localeCompare(b.key));
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/**
 * The camera that shows every point given: centred on their mean, zoomed
 * so the wider of the two spans fits — each zoom level halves the degrees
 * a view covers, so the zoom is the log of the span with a little air
 * around it. One point, or several on one spot, is a street-level view.
 */
export function cameraFor(points: readonly Placed[]): Camera | null {
    if (points.length === 0) return null;
    const { latitude, longitude } = meanOf(points);
    const lats = points.map((point) => point.latitude);
    const lngs = points.map((point) => point.longitude);
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    if (span < 0.002) return { latitude, longitude, zoom: 16 };
    return { latitude, longitude, zoom: clampZoom(Math.floor(Math.log2(180 / (span * 1.4)))) };
}

/** The camera one step closer on a bubble: two levels in, centred on it — enough to split most cells. */
export function cameraInto(cluster: Pick<MarkerCluster, "latitude" | "longitude">, zoom: number): Camera {
    return { latitude: cluster.latitude, longitude: cluster.longitude, zoom: clampZoom(zoom + 2) };
}

/** A zoom button's step, kept inside the camera's limits. */
export const stepZoom = (zoom: number, by: 1 | -1): number => clampZoom(Math.round(zoom) + by);
