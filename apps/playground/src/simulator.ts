import type { Position } from '@kinesisjs/core';

interface SimVehicle {
  id: string;
  lng: number;
  lat: number;
  heading: number; // degrees, 0 = north, 90 = east
  speed: number; // km/h
  color: string;
}

const PALETTE = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6'];
const METERS_PER_DEG_LAT = 111_320;
const SPREAD_DEG = 0.06; // initial scatter radius around the centre

const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/**
 * A mock fleet that walks each vehicle along its heading and emits `Position[]`
 * for `tracker.ingest`. Replaces the real WebSocket/API the library expects the
 * consumer to provide.
 */
export class FleetSimulator {
  private vehicles: SimVehicle[] = [];
  private readonly suspended = new Set<string>();

  constructor(private readonly center: [number, number]) {}

  reset(count: number): void {
    this.suspended.clear();
    this.vehicles = Array.from({ length: count }, (_unused, i): SimVehicle => {
      const colorIndex = i % PALETTE.length;
      return {
        id: `v${i}`,
        lng: this.center[0] + rand(-SPREAD_DEG, SPREAD_DEG),
        lat: this.center[1] + rand(-SPREAD_DEG, SPREAD_DEG),
        heading: rand(0, 360),
        speed: rand(20, 90),
        color: PALETTE[colorIndex] ?? '#3b82f6',
      };
    });
  }

  /** Advance every vehicle by `dtMs` and return positions for the un-suspended ones. */
  step(dtMs: number): Position[] {
    const out: Position[] = [];
    for (const v of this.vehicles) {
      this.advance(v, dtMs);
      if (this.suspended.has(v.id)) continue;
      out.push({
        id: v.id,
        lng: v.lng,
        lat: v.lat,
        heading: v.heading,
        speed: v.speed,
        meta: { color: v.color },
      });
    }
    return out;
  }

  /** Suspend a vehicle's feed (signal-gap scenario) — it stops being ingested. */
  suspend(id: string): void {
    this.suspended.add(id);
  }

  resume(id: string): void {
    this.suspended.delete(id);
  }

  /** Jump a vehicle far in one shot (anomalous-jump scenario). */
  teleport(id: string, dLng: number, dLat: number): Position | undefined {
    const v = this.vehicles.find((x) => x.id === id);
    if (!v) return undefined;
    v.lng += dLng;
    v.lat += dLat;
    return {
      id: v.id,
      lng: v.lng,
      lat: v.lat,
      heading: v.heading,
      speed: v.speed,
      meta: { color: v.color },
    };
  }

  ids(): string[] {
    return this.vehicles.map((v) => v.id);
  }

  private advance(v: SimVehicle, dtMs: number): void {
    // Steer gently back toward the centre when a vehicle drifts too far, so the
    // fleet stays in view; otherwise wander.
    const dLngToCenter = this.center[0] - v.lng;
    const dLatToCenter = this.center[1] - v.lat;
    const drift = Math.hypot(dLngToCenter, dLatToCenter);
    if (drift > SPREAD_DEG * 1.5) {
      const bearing = (Math.atan2(dLngToCenter, dLatToCenter) * 180) / Math.PI;
      v.heading = (bearing + 360) % 360;
    } else {
      v.heading = (v.heading + rand(-15, 15) + 360) % 360;
    }

    const meters = ((v.speed * 1000) / 3600) * (dtMs / 1000);
    const headingRad = (v.heading * Math.PI) / 180;
    const latRad = (v.lat * Math.PI) / 180;
    v.lat += (meters * Math.cos(headingRad)) / METERS_PER_DEG_LAT;
    v.lng += (meters * Math.sin(headingRad)) / (METERS_PER_DEG_LAT * Math.cos(latRad));
  }
}
