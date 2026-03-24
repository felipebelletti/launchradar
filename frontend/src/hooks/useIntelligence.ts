import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import type { LaunchRecord } from '../types';

export interface IntelligenceStats {
  signalsToday: number;
  cryptoConfirmed: number;
  currentlyTracking: number;
  launchedToday: number;
  chainDistribution: Array<{
    chain: string;
    count: number;
    pct: number;
  }>;
  lastSignal: {
    projectName: string | null;
    chain: string | null;
    detectedAt: string;
  } | null;
}

export interface IntelligenceResponse {
  stats: IntelligenceStats;
  signals: LaunchRecord[];
}

export function useIntelligence() {
  return useQuery<IntelligenceResponse>({
    queryKey: ['intelligence'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/launches/intelligence`);
      if (!res.ok) throw new Error('Failed to fetch intelligence');
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}
