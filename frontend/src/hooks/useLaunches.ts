import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import { useDiscardStore } from '../store/discard.store';
import type { LaunchRecord } from '../types';

export function useLaunches() {
  const filters = useAppStore((s) => s.filters);
  const discardedIds = useDiscardStore((s) => s.discardedIds);

  const params = new URLSearchParams();
  if (filters.chains.size > 0) {
    params.set('chain', [...filters.chains].sort().join(','));
  }
  if (filters.categories.size > 0) {
    params.set('category', [...filters.categories].sort().join(','));
  }
  if (filters.timeframe !== 'all') {
    params.set('timeframe', filters.timeframe);
  }
  if (filters.minFollowers !== null && filters.minFollowers > 0) {
    params.set('minFollowers', String(filters.minFollowers));
  }

  const qs = params.toString();
  const url = `${API_BASE_URL}/launches${qs ? `?${qs}` : ''}`;

  const queryKey = [
    'launches',
    {
      chain: filters.chains.size ? [...filters.chains].sort().join(',') : undefined,
      category: filters.categories.size ? [...filters.categories].sort().join(',') : undefined,
      timeframe: filters.timeframe === 'all' ? undefined : filters.timeframe,
      minFollowers: filters.minFollowers,
    },
  ] as const;

  const query = useQuery<LaunchRecord[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch launches');
      const data: unknown = await res.json();
      return (data as { data: LaunchRecord[] }).data ?? (data as LaunchRecord[]);
    },
    refetchInterval: 30_000,
  });

  const data = useMemo(
    () => query.data?.filter((l) => !discardedIds.has(l.id)),
    [query.data, discardedIds],
  );

  return { ...query, data };
}
