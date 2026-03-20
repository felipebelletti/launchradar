import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import type { LaunchRecord } from '../types';

export function useLaunch(id: string | null) {
  return useQuery<LaunchRecord>({
    queryKey: ['launch', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/launches/${id}`);
      if (!res.ok) throw new Error('Failed to fetch launch');
      const data: unknown = await res.json();
      return (data as { data: LaunchRecord }).data ?? (data as LaunchRecord);
    },
    enabled: !!id,
  });
}
