import { useCallback, useEffect, useRef, useState } from 'react';
import { accountApi, AccountError, type AccountPlaces } from '../lib/groups';
import { canKeep } from '../lib/grab';
import type { MyPlace, SavedPlace } from '../lib/models';
import type { Groups } from './useGroups';
import { useStored } from './useStored';

/** Where this phone stands with the places kept on the account. */
interface Meta {
  /** The account they were last in step with. */
  user: string;
  version: number;
  /** Changed on this phone since then, and not sent yet (e.g. no signal). */
  dirty: boolean;
}

interface Lists {
  saved: SavedPlace[];
  myPlaces: MyPlace[];
}

const isObject = (v: unknown): v is Record<string, unknown> => v != null && typeof v === 'object';
const isPlace = (v: unknown) =>
  isObject(v) && typeof v.id === 'string' && typeof v.name === 'string' && Array.isArray(v.coord) && v.coord.length === 2;
const isSaved = (v: unknown): v is SavedPlace => isObject(v) && typeof v.label === 'string' && isPlace(v.place);
const isMine = (v: unknown): v is MyPlace => isPlace(v) && isObject(v) && typeof v.at === 'number';

/** Only what looks right is taken from the server. */
function clean(data: unknown): Lists & { version: number } {
  const d = isObject(data) ? (data as Partial<AccountPlaces>) : {};
  return {
    version: typeof d.version === 'number' ? d.version : 0,
    saved: Array.isArray(d.saved) ? d.saved.filter(isSaved) : [],
    myPlaces: Array.isArray(d.myPlaces) ? d.myPlaces.filter(isMine) : [],
  };
}

/** The account's places, plus what only this phone has. Nothing is dropped. */
function join(theirs: Lists, mine: Lists): Lists {
  return {
    saved: [
      ...theirs.saved,
      ...mine.saved.filter((m) => !theirs.saved.some((t) => t.label === m.label || t.place.id === m.place.id)),
    ],
    myPlaces: [...theirs.myPlaces, ...mine.myPlaces.filter((m) => !theirs.myPlaces.some((t) => t.id === m.id))],
  };
}

const asText = (lists: Lists) => JSON.stringify([lists.saved, lists.myPlaces]);

/** After a failed send or fetch (no signal), try again this often. */
const RETRY_MS = 30000;
/** Wait for a burst of changes to finish before sending. */
const SETTLE_MS = 800;

/**
 * Keeps saved places and added places with a signed-in account, so they come
 * back on a new phone. A guest's never leave the phone. The whole list is
 * sent when it changes; if another phone changed it first, the two are joined.
 */
export function usePlaceSync(
  groups: Groups,
  saved: SavedPlace[],
  setSaved: (next: SavedPlace[]) => void,
  myPlaces: MyPlace[],
  setMyPlaces: (next: MyPlace[]) => void,
) {
  const [meta, setMeta] = useStored<Meta | null>('otw-places-sync', null, (v) => v == null || isObject(v));
  const [retry, setRetry] = useState(0);
  const me = groups.state?.login.signedIn ? groups.state.me : null;
  const serverVersion = groups.state?.placesVersion ?? 0;

  const local = useRef<Lists>({ saved, myPlaces });
  local.current = { saved, myPlaces };
  const metaRef = useRef(meta);
  metaRef.current = meta;
  /** What the lists looked like when they were last in step with the account. */
  const inStep = useRef<string | null>(meta && !meta.dirty ? asText(local.current) : null);
  const busy = useRef(false);
  const { withToken } = groups;

  const run = useCallback(
    async (user: string, newest: number) => {
      const before = asText(local.current);
      const settle = (lists: Lists, version: number) => {
        // Changed on the phone while this was on its way: keep that, and send it next.
        if (asText(local.current) !== before) {
          setMeta({ user, version, dirty: true });
          return;
        }
        inStep.current = asText(lists);
        setSaved(lists.saved);
        setMyPlaces(lists.myPlaces);
        setMeta({ user, version, dirty: false });
      };
      const pull = async () => clean(await withToken(accountApi.places));

      const m = metaRef.current;
      let mine = local.current;
      let base: number;
      if (!m || m.user !== user) {
        // First time for this account on this phone: join what's here with what the account has.
        const theirs = await pull();
        mine = join(theirs, mine);
        base = theirs.version;
        if (asText(mine) === asText(theirs)) return settle(mine, base);
      } else if (m.dirty) {
        base = m.version;
      } else {
        if (newest === m.version) return;
        const theirs = await pull();
        return settle(theirs, theirs.version);
      }

      // Send it, joining again if another phone got in first.
      for (let tries = 0; tries < 3; tries++) {
        try {
          // A GrabMaps place may only be kept once it was asked for as Storage (see grab.ts).
          const sending = mine.saved.filter((s) => canKeep(s.place));
          const { version } = await withToken((t) => accountApi.savePlaces(t, base, sending, mine.myPlaces));
          return settle(mine, version);
        } catch (e) {
          if (!(e instanceof AccountError && e.status === 409)) throw e;
          const theirs = clean(e.data);
          mine = join(theirs, mine);
          base = theirs.version;
        }
      }
    },
    [withToken, setMeta, setSaved, setMyPlaces],
  );

  const sync = useCallback(
    async (user: string, newest: number) => {
      if (busy.current) return;
      busy.current = true;
      try {
        await run(user, newest);
      } finally {
        busy.current = false;
      }
    },
    [run],
  );

  // A change made on this phone has to go to the account.
  useEffect(() => {
    if (!me || !meta || meta.user !== me || meta.dirty || inStep.current == null) return;
    if (asText({ saved, myPlaces }) !== inStep.current) setMeta({ ...meta, dirty: true });
  }, [me, meta, saved, myPlaces, setMeta]);

  // In step again whenever something is out: just signed in, a change here, or a change on another phone.
  const outOfStep = me != null && (!meta || meta.user !== me || meta.dirty || meta.version !== serverVersion);
  useEffect(() => {
    if (!me || !outOfStep) return;
    const t = window.setTimeout(() => {
      sync(me, serverVersion).catch(() => {
        // No signal: what's on the phone stays, and it's tried again.
        window.setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [me, outOfStep, serverVersion, meta, retry, sync]);

  /** Before logging out: make sure nothing changed here is still unsent. Throws if it can't be sent. */
  const flush = useCallback(async () => {
    const m = metaRef.current;
    if (me && m && m.user === me && (m.dirty || asText(local.current) !== inStep.current)) {
      metaRef.current = { ...m, dirty: true };
      await sync(me, m.version);
    }
  }, [me, sync]);

  /** After logging out of a signed-in account: its places leave this phone. They stay with the account. */
  const forget = useCallback(() => {
    inStep.current = null;
    setSaved([]);
    setMyPlaces([]);
    setMeta(null);
  }, [setSaved, setMyPlaces, setMeta]);

  return { flush, forget };
}
