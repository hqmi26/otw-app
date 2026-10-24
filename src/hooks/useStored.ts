import { useCallback, useState } from 'react';

/**
 * State that is also kept in the phone's local storage, so it survives
 * closing the app. Falls back to plain state when storage is blocked.
 */
export function useStored<T>(key: string, initial: T, isValid: (v: unknown) => boolean = () => true) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return isValid(parsed) ? (parsed as T) : initial;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(v));
        } catch {
          // Private mode or storage full: keep it for this session only.
        }
        return v;
      });
    },
    [key],
  );

  return [value, update] as const;
}
