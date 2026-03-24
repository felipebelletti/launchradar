import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import { useAuthStore } from '../store/auth.store';

interface UserSettings {
  minFollowers: number | null;
}

export function useSettings() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setMinFollowers = useAppStore((s) => s.setMinFollowers);
  const queryClient = useQueryClient();
  const synced = useRef(false);

  const query = useQuery<UserSettings>({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/settings`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch settings');
      const json = (await res.json()) as { data: UserSettings };
      return json.data;
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  // Sync fetched settings into the app store (once on load)
  useEffect(() => {
    if (query.data && !synced.current) {
      synced.current = true;
      setMinFollowers(query.data.minFollowers);
    }
  }, [query.data, setMinFollowers]);

  const mutation = useMutation({
    mutationFn: async (settings: Partial<UserSettings>) => {
      const res = await fetch(`${API_BASE_URL}/settings`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to update settings');
      const json = (await res.json()) as { data: UserSettings };
      return json.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user-settings'], data);
      setMinFollowers(data.minFollowers);
    },
  });

  const updateMinFollowers = useCallback(
    (value: number | null) => {
      setMinFollowers(value);
      mutation.mutate({ minFollowers: value });
    },
    [setMinFollowers, mutation],
  );

  return {
    settings: query.data ?? { minFollowers: null },
    isLoading: query.isLoading,
    updateMinFollowers,
    isSaving: mutation.isPending,
  };
}
