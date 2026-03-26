import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useDiscardStore } from '../store/discard.store';
import type { LaunchRecord } from '../types';

export interface IntelligenceStats {
  signalsToday: number;
  cryptoConfirmed: number;
  currentlyTracking: number;
  launchedToday: number;
  platformDistribution: Array<{
    platform: string;
    count: number;
    pct: number;
  }>;
  lastSignal: {
    projectName: string | null;
    platform: string | null;
    detectedAt: string;
  } | null;
}

export interface IntelligenceResponse {
  stats: IntelligenceStats;
  signals: LaunchRecord[];
}

export function useIntelligence() {
  const discardedIds = useDiscardStore((s) => s.discardedIds);

  const query = useQuery<IntelligenceResponse>({
    queryKey: ['intelligence'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/launches/intelligence`);
      if (!res.ok) throw new Error('Failed to fetch intelligence');
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const data = useMemo(() => {
    if (!query.data) return undefined;
    return {
      ...query.data,
      signals: query.data.signals.filter((l) => !discardedIds.has(l.id)),
    };
  }, [query.data, discardedIds]);

  return { ...query, data };
}
