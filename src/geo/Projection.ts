import type { BBox } from './types';

export class Projection {
  readonly origin: { lat: number; lon: number };
  private readonly mPerDegLat: number;
  private readonly mPerDegLon: number;

  constructor(origin: { lat: number; lon: number }) {
    this.origin = origin;
    this.mPerDegLat = 111320;
    this.mPerDegLon = 111320 * Math.cos(origin.lat * (Math.PI / 180));
  }

  /**
   * Geographic coordinates → local XZ world space.
   * +X = East, +Z = South (Three.js convention).
   */
  project(lat: number, lon: number): [number, number] {
    const x = (lon - this.origin.lon) * this.mPerDegLon;
    const z = -(lat - this.origin.lat) * this.mPerDegLat;
    return [x, z];
  }

  /** Local XZ → geographic coordinates. */
  unproject(x: number, z: number): [number, number] {
    const lat = this.origin.lat - z / this.mPerDegLat;
    const lon = this.origin.lon + x / this.mPerDegLon;
    return [lat, lon];
  }

  static bboxFromCenter(lat: number, lon: number, radiusM: number): BBox {
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
