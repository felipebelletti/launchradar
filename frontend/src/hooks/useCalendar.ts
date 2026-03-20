import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import type { CalendarData } from '../types';

export function useCalendar() {
  const filters = useAppStore((s) => s.filters);

  const params = new URLSearchParams();
  if (filters.chains.size > 0) {
    params.set('chain', [...filters.chains].join(','));
  }
  if (filters.categories.size > 0) {
    params.set('category', [...filters.categories].join(','));
  }

  const qs = params.toString();
  const url = `${API_BASE_URL}/launches/calendar${qs ? `?${qs}` : ''}`;

  return useQuery<CalendarData>({
    queryKey: ['calendar', Object.fromEntries(params)],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch calendar');
      const data: unknown = await res.json();
      return (data as { data: CalendarData }).data ?? (data as CalendarData);
    },
    refetchInterval: 30_000,
  });
}
