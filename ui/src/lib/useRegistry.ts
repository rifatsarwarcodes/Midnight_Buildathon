// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useState } from 'react';
import { config } from '../config';
import { fetchRegistry, type RegistrySnapshot } from './registry';

export function useRegistry(refreshMs = 15_000) {
  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!config.contractAddress) {
      setError('No registry address configured for this build.');
      return;
    }
    setLoading(true);
    try {
      setSnapshot(await fetchRegistry(config.contractAddress));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, refreshMs);
    return () => clearInterval(t);
  }, [refresh, refreshMs]);

  return { snapshot, error, loading, refresh };
}
