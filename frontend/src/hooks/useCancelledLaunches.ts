import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import type { LaunchRecord } from '../types';

export function useCancelledLaunches() {
  const filters = useAppStore((s) => s.filters);

  const params = new URLSearchParams();
  params.set('status', 'CANCELLED');
  if (filters.platforms.size > 0) {
    params.set('platform', [...filters.platforms].sort().join(','));
  }
  if (filters.categories.size > 0) {
    params.set('category', [...filters.categories].sort().join(','));
  }

  const qs = params.toString();
  const url = `${API_BASE_URL}/launches?${qs}`;

  const queryKey = [
    'launches',
    'cancelled',
    {
      platform: filters.platforms.size ? [...filters.platforms].sort().join(',') : undefined,
      category: filters.categories.size ? [...filters.categories].sort().join(',') : undefined,
    },
  ] as const;

  return useQuery<LaunchRecord[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch cancelled launches');
      const data: unknown = await res.json();
      return (data as { data: LaunchRecord[] }).data ?? (data as LaunchRecord[]);
    },
    refetchInterval: 30_000,
  });
}
