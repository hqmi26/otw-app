import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  accountApi,
  AccountError,
  areaAt,
  type Area,
  type GroupsState,
  type NewGroup,
  type StatusPatch,
} from '../lib/groups';
import { distance, type LngLat } from '../lib/geo';
import { useStored } from './useStored';

/** How often the groups refresh: quicker while someone's car is moving. */
const POLL_MS = 30000;
const POLL_LIVE_MS = 10000;

/**
 * Your account and groups. Every phone gets a hidden ID and a secret token the
 * first time it opens OTW. Only someone in a group keeps hearing from the
 * server; the rest just ask once when the app opens.
 */
export function useGroups(enabled: boolean) {
  const [token, setToken] = useStored<string | null>('otw-token', null, (v) => v == null || typeof v === 'string');
  const [state, setState] = useState<GroupsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const forget = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    setState(null);
  }, [setToken]);

  /** This phone's key, made the first time it's needed. */
  const making = useRef<Promise<string> | null>(null);
  const ensureToken = useCallback((): Promise<string> => {
    if (tokenRef.current) return Promise.resolve(tokenRef.current);
    making.current ??= accountApi
      .guest()
      .then((r) => {
        tokenRef.current = r.token;
        setToken(r.token);
        return r.token;
      })
      .finally(() => {
        making.current = null;
      });
    return making.current;
  }, [setToken]);

  /** Runs a request; if the server no longer knows this phone, it starts again as a new guest. */
  const guard = useCallback(
    async <T>(run: (token: string) => Promise<T>): Promise<T> => {
      try {
        return await run(await ensureToken());
      } catch (e) {
        if (e instanceof AccountError && e.status === 401) forget();
        throw e;
      }
    },
    [ensureToken, forget],
  );

  const refresh = useCallback(async () => {
    try {
      setState(await guard(accountApi.state));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Couldn’t load your groups.');
    }
  }, [guard]);

  const inGroup = (state?.groups.length ?? 0) > 0;
  const someoneLive = state?.groups.some((g) => g.members.some((m) => m.id !== state.me && m.live)) ?? false;
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const id = inGroup ? window.setInterval(onVisible, someoneLive ? POLL_LIVE_MS : POLL_MS) : undefined;
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, token, inGroup, someoneLive, refresh]);

  const start = useCallback(
    async (group: NewGroup) => {
      const next = await guard((t) => accountApi.start(t, group));
      setState(next);
      return next;
    },
    [guard],
  );

  const join = useCallback(
    async (code: string, name: string) => setState(await guard((t) => accountApi.join(t, code, name))),
    [guard],
  );

  const update = useCallback(
    async (patch: StatusPatch) => setState(await guard((t) => accountApi.update(t, patch))),
    [guard],
  );

  const newLink = useCallback(
    async (groupId: string) => setState(await guard((t) => accountApi.newLink(t, groupId))),
    [guard],
  );

  const leave = useCallback(
    async (groupId: string) => setState(await guard((t) => accountApi.leave(t, groupId))),
    [guard],
  );

  const remove = useCallback(
    async (groupId: string, userId: string) => setState(await guard((t) => accountApi.remove(t, groupId, userId))),
    [guard],
  );

  /** Tells the server, then forgets this phone's key. Throws if the server can't be reached. */
  const finish = useCallback(
    async (call: (token: string) => Promise<unknown>) => {
      const t = tokenRef.current;
      if (t) {
        await call(t).catch((e: unknown) => {
          // The server already doesn't know this phone, so there's nothing left to do there.
          if (!(e instanceof AccountError && e.status === 401)) throw e;
        });
      }
      forget();
    },
    [forget],
  );
  const logout = useCallback(() => finish(accountApi.logout), [finish]);
  const deleteAccount = useCallback(() => finish(accountApi.deleteAccount), [finish]);

  const family = state?.groups.find((g) => g.type === 'family') ?? null;
  return useMemo(
    () => ({
      token,
      state,
      family,
      loadError,
      ensureToken,
      refresh,
      start,
      join,
      update,
      newLink,
      leave,
      remove,
      logout,
      deleteAccount,
    }),
    [token, state, family, loadError, ensureToken, refresh, start, join, update, newLink, leave, remove, logout, deleteAccount],
  );
}

export type Groups = ReturnType<typeof useGroups>;

/** Work the area out again after moving this far. */
const AREA_RECHECK_M = 150;
/** With no name yet (no signal), try again this often even without moving. */
const AREA_RETRY_MS = 30000;

/** The area you're in (e.g. Likas). Null while off. */
export function useArea(position: LngLat | null): Area | null {
  const [area, setArea] = useState<Area | null>(null);
  const last = useRef<{ at: LngLat; time: number; found: boolean } | null>(null);
  useEffect(() => {
    if (!position) return;
    const l = last.current;
    if (l && distance(l.at, position) < AREA_RECHECK_M && (l.found || Date.now() - l.time < AREA_RETRY_MS)) return;
    const lookup = { at: position, time: Date.now(), found: false };
    last.current = lookup;
    // Not cancelled when the next fix comes in: GPS fixes arrive faster than
    // the answer does, and a nearby fix doesn't start a new lookup.
    void areaAt(position).then((a) => {
      // A newer lookup wins; with no name at all, the last area stays.
      if (last.current !== lookup || !a) return;
      lookup.found = true;
      setArea((old) => (old?.name === a.name ? old : a));
    });
  }, [position]);
  return position ? area : null;
}

export interface Sharing {
  area: Area | null;
  trip: { to: string; eta: number } | null;
  /** Normal groups this trip is shared with. */
  shareWith: string[];
  live: { lat: number; lng: number; heading: number | null } | null;
}

/** Re-send the area this often even when it hasn't changed, so family see "since" stay fresh. */
const AREA_HEARTBEAT_MS = 5 * 60 * 1000;
/** Send the moving car this often during a live trip. */
const LIVE_EVERY_MS = 10000;
/** Re-send the ETA when it moves by this much, or at least this often. */
const ETA_CHANGE_S = 90;
const TRIP_EVERY_MS = 2 * 60 * 1000;
/** After a failed send (no signal), wait this long before trying again. */
const RETRY_MS = 15000;

interface Sent {
  area: string | null;
  areaAt: number;
  trip: string | null;
  eta: number;
  tripAt: number;
  live: boolean;
  liveAt: number;
}
const NOTHING_SENT: Sent = { area: null, areaAt: 0, trip: null, eta: 0, tripAt: 0, live: false, liveAt: 0 };

/**
 * Sends your area, trip ETA and (only during a live trip) the moving car to
 * your groups, without flooding the server: only when something changed, or
 * now and then to say you're still there. Nothing is sent while Private is on.
 */
export function useGroupSharing(groups: Groups, share: Sharing) {
  const sent = useRef<Sent>(NOTHING_SENT);
  const busyUntil = useRef(0);
  const isPrivate = groups.state?.private ?? true;
  const inGroup = (groups.state?.groups.length ?? 0) > 0;

  // Coming back from Private (or joining) starts afresh, so everything goes out at once.
  useEffect(() => {
    sent.current = NOTHING_SENT;
  }, [isPrivate, inGroup, groups.token]);

  const { area, trip, shareWith, live } = share;
  useEffect(() => {
    if (!groups.token || !inGroup || isPrivate) return;
    const now = Date.now();
    if (now < busyUntil.current) return;
    const s = sent.current;
    const patch: StatusPatch = {};

    if (area && (area.name !== s.area || now - s.areaAt > AREA_HEARTBEAT_MS)) patch.area = area;
    const tripTo = trip?.to ?? null;
    if (tripTo !== s.trip) {
      patch.trip = trip; // started, changed or ended (ending clears the car too)
    } else if (trip && (Math.abs(trip.eta - s.eta) >= ETA_CHANGE_S || now - s.tripAt > TRIP_EVERY_MS)) {
      patch.trip = trip;
    }
    if (patch.trip) patch.shareWith = shareWith;
    if (live && now - s.liveAt >= LIVE_EVERY_MS) patch.live = live;
    else if (!live && s.live && patch.trip === undefined) patch.live = null;
    if (Object.keys(patch).length === 0) return;

    busyUntil.current = now + RETRY_MS;
    groups
      .update(patch)
      .then(() => {
        const next = { ...sent.current };
        if (patch.area) Object.assign(next, { area: patch.area.name, areaAt: now });
        if (patch.trip !== undefined) Object.assign(next, { trip: tripTo, eta: trip?.eta ?? 0, tripAt: now });
        if (patch.live) Object.assign(next, { live: true, liveAt: now });
        if (patch.live === null || patch.trip === null) Object.assign(next, { live: false, liveAt: 0 });
        sent.current = next;
        busyUntil.current = 0;
      })
      .catch(() => {
        // No signal: keep what we had and try again after RETRY_MS.
      });
  }, [groups, inGroup, isPrivate, area, trip, shareWith, live]);
}
