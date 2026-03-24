import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import { useDiscardStore } from '../store/discard.store';
import type { LaunchRecord } from '../types';

/**
 * Fetches both cancelled launches (from backend) and user-discarded launches,
 * merging them into a single list for the trash bin panel.
 */
export function useTrashBin() {
  const filters = useAppStore((s) => s.filters);
  const discardedIds = useDiscardStore((s) => s.discardedIds);

  // Fetch cancelled launches
  const cancelledParams = new URLSearchParams();
  cancelledParams.set('status', 'CANCELLED');
  if (filters.chains.size > 0) {
    cancelledParams.set('chain', [...filters.chains].sort().join(','));
  }
  if (filters.categories.size > 0) {
    cancelledParams.set('category', [...filters.categories].sort().join(','));
  }

  const cancelledQuery = useQuery<LaunchRecord[]>({
    queryKey: [
      'launches',
      'cancelled',
      {
        chain: filters.chains.size ? [...filters.chains].sort().join(',') : undefined,
        category: filters.categories.size ? [...filters.categories].sort().join(',') : undefined,
      },
    ],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/launches?${cancelledParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch cancelled launches');
      const data: unknown = await res.json();
      return (data as { data: LaunchRecord[] }).data ?? (data as LaunchRecord[]);
    },
    refetchInterval: 30_000,
  });

  // Fetch all launches (unfiltered by status) to find discarded ones
  const allParams = new URLSearchParams();
  if (filters.chains.size > 0) {
    allParams.set('chain', [...filters.chains].sort().join(','));
  }
  if (filters.categories.size > 0) {
    allParams.set('category', [...filters.categories].sort().join(','));
  }

  const allQuery = useQuery<LaunchRecord[]>({
    queryKey: [
      'launches',
      {
        chain: filters.chains.size ? [...filters.chains].sort().join(',') : undefined,
        category: filters.categories.size ? [...filters.categories].sort().join(',') : undefined,
      },
    ],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/launches${allParams.toString() ? `?${allParams.toString()}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch launches');
      const data: unknown = await res.json();
      return (data as { data: LaunchRecord[] }).data ?? (data as LaunchRecord[]);
    },
    refetchInterval: 30_000,
  });

  const data = useMemo(() => {
    const seen = new Set<string>();
    const result: (LaunchRecord & { trashReason: 'cancelled' | 'discarded' })[] = [];

    // Add cancelled launches
    for (const l of cancelledQuery.data ?? []) {
      if (!seen.has(l.id)) {
        seen.add(l.id);
        result.push({ ...l, trashReason: discardedIds.has(l.id) ? 'discarded' : 'cancelled' });
      }
    }

    // Add user-discarded launches (that aren't already cancelled)
    for (const l of allQuery.data ?? []) {
      if (discardedIds.has(l.id) && !seen.has(l.id)) {
        seen.add(l.id);
        result.push({ ...l, trashReason: 'discarded' });
      }
    }

    // Sort newest first
    result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return result;
  }, [cancelledQuery.data, allQuery.data, discardedIds]);

  return {
    data,
    isLoading: cancelledQuery.isLoading || allQuery.isLoading,
  };
}
