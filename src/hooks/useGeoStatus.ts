import { useEffect } from 'react';
import { geoStatus, type GeoStatus } from '../lib/grab';
import { useStored } from './useStored';

/** What the server has keys for. Remembered, so the right map shows from the first moment next time. */
export function useGeoStatus(): GeoStatus {
  const [status, setStatus] = useStored<GeoStatus>('otw-geo', { grab: false, traffic: false });
  useEffect(() => {
    void geoStatus().then(setStatus);
  }, [setStatus]);
  return status;
}
