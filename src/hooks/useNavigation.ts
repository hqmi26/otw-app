import { useEffect, useMemo, useRef, useState } from 'react';
import type { Route } from '../lib/api';
import { cumulative, pointAlong, snapToLine, type LngLat } from '../lib/geo';

export interface Progress {
  /** Index into route.steps of the next manoeuvre. */
  stepIndex: number;
  /** Metres to that manoeuvre. */
  toManeuver: number;
  /** Metres left to the destination. */
  remaining: number;
  /** Seconds left, scaled from the route's estimate (no traffic). */
  remainingTime: number;
  /** Metres of the route already driven. */
  covered: number;
  offRoute: boolean;
  arrived: boolean;
  /**
   * The car's spot on the route and the road's direction there, when GPS puts
   * it close enough to trust. Lets the arrow sit on the road and keeps the map
   * steady while GPS wobbles (e.g. standing still indoors).
   */
  onRoad: { coord: LngLat; heading: number } | null;
}

const OFF_ROUTE_M = 45;
const SNAP_M = 30;
const ARRIVED_M = 25;
/** Parked off the road at the destination still counts, but further than this is overshooting it. */
const ARRIVED_NEAR_M = 150;

/** Where the driver is on the route and what comes next. */
export function useNavProgress(route: Route | null, position: LngLat | null): Progress | null {
  const prepared = useMemo(() => {
    if (!route) return null;
    const cum = cumulative(route.coords);
    const stepAlong = route.steps.map((s) => snapToLine(s.location, route.coords, cum).along);
    return { cum, stepAlong, total: cum[cum.length - 1] };
  }, [route]);

  return useMemo(() => {
    if (!route || !prepared || !position) return null;
    const snap = snapToLine(position, route.coords, prepared.cum);
    let next = prepared.stepAlong.findIndex((a, i) => i > 0 && a > snap.along + 8);
    if (next === -1) next = route.steps.length - 1;
    const remaining = Math.max(0, prepared.total - snap.along);
    return {
      stepIndex: next,
      toManeuver: Math.max(0, prepared.stepAlong[next] - snap.along),
      remaining,
      remainingTime: route.duration * (remaining / Math.max(1, prepared.total)),
      covered: snap.along,
      offRoute: snap.offset > OFF_ROUTE_M,
      arrived: remaining < ARRIVED_M && snap.offset < ARRIVED_NEAR_M,
      onRoad: snap.offset <= SNAP_M ? pointAlong(route.coords, prepared.cum, snap.along) : null,
    };
  }, [route, prepared, position]);
}

/**
 * Pretends to drive along the route. Used on laptops (no GPS) and with ?sim in
 * the address, so the navigation screen can be tested without leaving the house.
 */
export function useSimulatedDrive(route: Route | null, active: boolean, speedMultiplier: number) {
  const [state, setState] = useState<{ coord: LngLat; heading: number } | null>(null);
  const along = useRef(0);
  const cum = useMemo(() => (route ? cumulative(route.coords) : null), [route]);

  useEffect(() => {
    along.current = 0;
    setState(route && cum ? pointAlong(route.coords, cum, 0) : null);
  }, [route, cum]);

  useEffect(() => {
    if (!active || !route || !cum) return;
    const metresPerTick = 12 * 0.5 * speedMultiplier; // ~43 km/h at ×1
    const id = window.setInterval(() => {
      along.current = Math.min(cum[cum.length - 1], along.current + metresPerTick);
      setState(pointAlong(route.coords, cum, along.current));
    }, 500);
    return () => window.clearInterval(id);
  }, [active, route, cum, speedMultiplier]);

  return active ? state : null;
}
