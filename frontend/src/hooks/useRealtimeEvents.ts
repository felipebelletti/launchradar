import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import type { BackendEvent, LaunchRecord } from '../types';

export function useRealtimeEvents() {
  const queryClient = useQueryClient();
  const addPending = useAppStore((s) => s.addPending);
  const setConnected = useAppStore((s) => s.setConnected);
  const retryDelay = useRef(1000);

  useEffect(() => {
    let es: EventSource | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      es = new EventSource(`${API_BASE_URL}/events`);

      es.onopen = () => {
        setConnected(true);
        retryDelay.current = 1000;
      };

      es.addEventListener('connected', () => {
        setConnected(true);
      });

      es.addEventListener('ping', () => {
        setConnected(true);
      });

      es.onmessage = (event) => {
        setConnected(true);
        try {
          const parsed = JSON.parse(event.data as string) as BackendEvent;

          if (parsed.type === 'launch:new') {
            addPending(parsed.payload.id);
            void queryClient.invalidateQueries({ queryKey: ['launches'] });
            void queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }

          if (parsed.type === 'launch:updated') {
            void queryClient.invalidateQueries({ queryKey: ['launches'] });
            queryClient.setQueryData<LaunchRecord>(
              ['launch', parsed.payload.id],
              parsed.payload,
            );
            void queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }

          if (parsed.type === 'launch:cancelled') {
            void queryClient.invalidateQueries({ queryKey: ['launches'] });
            queryClient.removeQueries({ queryKey: ['launch', parsed.payload.id] });
            void queryClient.invalidateQueries({ queryKey: ['calendar'] });
          }
        } catch {
          // ignore malformed events
        }
      };

      es.onerror = () => {
        if (es?.readyState === EventSource.OPEN) {
          return;
        }
        setConnected(false);
        es?.close();
        const delay = retryDelay.current;
        retryDelay.current = Math.min(delay * 2, 30_000);
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      disposed = true;
      es?.close();
    };
  }, [addPending, setConnected, queryClient]);
}
