import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import { useDiscardStore } from '../store/discard.store';
import type { CalendarData } from '../types';

export function useCalendar() {
  const filters = useAppStore((s) => s.filters);
  const discardedIds = useDiscardStore((s) => s.discardedIds);

  const params = new URLSearchParams();
  if (filters.platforms.size > 0) {
    params.set('platform', [...filters.platforms].sort().join(','));
  }
  if (filters.categories.size > 0) {
    params.set('category', [...filters.categories].sort().join(','));
  }
  if (filters.minFollowers !== null && filters.minFollowers > 0) {
    params.set('minFollowers', String(filters.minFollowers));
  }

  const qs = params.toString();
  const url = `${API_BASE_URL}/launches/calendar${qs ? `?${qs}` : ''}`;

  const queryKey = [
    'calendar',
    {
      platform: filters.platforms.size ? [...filters.platforms].sort().join(',') : undefined,
      category: filters.categories.size ? [...filters.categories].sort().join(',') : undefined,
      minFollowers: filters.minFollowers,
    },
  ] as const;

  const query = useQuery<CalendarData>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch calendar');
      const data: unknown = await res.json();
      return (data as { data: CalendarData }).data ?? (data as CalendarData);
    },
    refetchInterval: 30_000,
  });

  const data = useMemo(() => {
    if (!query.data) return undefined;
    const f = (arr: typeof query.data.hour) => arr.filter((l) => !discardedIds.has(l.id));
    return {
      hour: f(query.data.hour),
      today: f(query.data.today),
      week: f(query.data.week),
      live: f(query.data.live),
      tbd: f(query.data.tbd),
    };
  }, [query.data, discardedIds]);

  return { ...query, data };
}
