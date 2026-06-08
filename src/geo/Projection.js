export class Projection {
    origin;
    mPerDegLat;
    mPerDegLon;
    constructor(origin) {
        this.origin = origin;
        this.mPerDegLat = 111320;
        this.mPerDegLon = 111320 * Math.cos(origin.lat * (Math.PI / 180));
    }
    /**
     * Geographic coordinates → local XZ world space.
     * +X = East, +Z = South (Three.js convention).
     */
    project(lat, lon) {
        const x = (lon - this.origin.lon) * this.mPerDegLon;
        const z = -(lat - this.origin.lat) * this.mPerDegLat;
        return [x, z];
    }
    /** Local XZ → geographic coordinates. */
    unproject(x, z) {
        const lat = this.origin.lat - z / this.mPerDegLat;
        const lon = this.origin.lon + x / this.mPerDegLon;
        return [lat, lon];
    }
    static bboxFromCenter(lat, lon, radiusM) {
        const dLat = radiusM / 111320;
        const dLon = radiusM / (111320 * Math.cos(lat * (Math.PI / 180)));
        return {
            south: lat - dLat,
            north: lat + dLat,
            west: lon - dLon,
            east: lon + dLon,
        };
    }
}
