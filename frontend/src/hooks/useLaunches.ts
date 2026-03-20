import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import type { LaunchRecord } from '../types';

export function useLaunches() {
  const filters = useAppStore((s) => s.filters);

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

  const qs = params.toString();
  const url = `${API_BASE_URL}/launches${qs ? `?${qs}` : ''}`;

  const queryKey = [
    'launches',
    {
      chain: filters.chains.size ? [...filters.chains].sort().join(',') : undefined,
      category: filters.categories.size ? [...filters.categories].sort().join(',') : undefined,
      timeframe: filters.timeframe === 'all' ? undefined : filters.timeframe,
    },
  ] as const;

  return useQuery<LaunchRecord[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch launches');
      const data: unknown = await res.json();
      return (data as { data: LaunchRecord[] }).data ?? (data as LaunchRecord[]);
    },
    refetchInterval: 30_000,
  });
}
