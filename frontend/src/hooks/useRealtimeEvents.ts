import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../api-base';
import { useAppStore } from '../store/app.store';
import { useNotificationStore } from '../store/notification.store';
import { useWatchlistStore } from '../store/watchlist.store';
import { useDiscardStore } from '../store/discard.store';
import { playSound } from '../lib/sounds';
import type { BackendEvent, LaunchRecord } from '../types';

/** Map of event type → which panels should be notified (excluding calendar sub-panels) */
const EVENT_PANEL_MAP: Record<BackendEvent['type'], { panelId: string; panelTitle: string }[]> = {
  'launch:new': [
    { panelId: 'signal-intel:new', panelTitle: 'SIGNAL FEED' },
  ],
  'launch:updated': [
    { panelId: 'signal-intel:updated', panelTitle: 'SIGNAL FEED' },
  ],
  'launch:cancelled': [
    { panelId: 'signal-intel:cancelled', panelTitle: 'SIGNAL FEED' },
    { panelId: 'trash', panelTitle: 'TRASH BIN' },
  ],
};

function getCalendarBucket(launch: LaunchRecord): { key: string; label: string } {
  if (!launch.launchDate) return { key: 'tbd', label: 'TBD' };
  if (launch.status === 'LIVE') return { key: 'live', label: 'LIVE' };

  const now = Date.now();
  const launchMs = new Date(launch.launchDate).getTime();
  const diffMs = launchMs - now;
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;
  const oneWeek = 7 * oneDay;

  if (diffMs <= 0) return { key: 'live', label: 'LIVE' };
  if (diffMs <= oneHour) return { key: 'hour', label: 'NEXT HOUR' };
  if (diffMs <= oneDay) return { key: 'today', label: 'TODAY' };
  if (diffMs <= oneWeek) return { key: 'week', label: 'THIS WEEK' };
  return { key: 'tbd', label: 'TBD' };
}

export function useRealtimeEvents() {
  const queryClient = useQueryClient();
  const addPending = useAppStore((s) => s.addPending);
  const setConnected = useAppStore((s) => s.setConnected);
  const retryDelay = useRef(1000);

  useEffect(() => {
    let es: EventSource | null = null;
    let disposed = false;

    function notifyPanels(eventType: BackendEvent['type'], message: string, launch?: LaunchRecord) {
      // Skip all notifications for discarded launches
      if (launch && useDiscardStore.getState().discardedIds.has(launch.id)) return;

      const { getPanelSettings, pushNotification, panelSettings } = useNotificationStore.getState();
      const panels = [...EVENT_PANEL_MAP[eventType]];

      if (launch && eventType === 'launch:new') {
        const bucket = getCalendarBucket(launch);
        panels.push({ panelId: `calendar-${bucket.key}`, panelTitle: bucket.label });
      }

      let soundPlayed = false;

      for (const { panelId, panelTitle } of panels) {
        const settings = getPanelSettings(panelId);
        if (!settings.enabled) continue;

        pushNotification({ panelId, panelTitle, message });

        if (!soundPlayed && settings.sound !== 'none') {
          playSound(settings.sound, settings.volume);
          soundPlayed = true;
        }
      }

      // Category-based notifications (on new launches)
      if (launch && eventType === 'launch:new') {
        const cats = launch.categories?.length ? launch.categories : ['Other'];
        for (const cat of cats) {
          const catSettings = getPanelSettings(`category:${cat}`);
          if (catSettings.enabled) {
            pushNotification({
              panelId: `category:${cat}`,
              panelTitle: cat.toUpperCase(),
              message: `New ${cat} launch: ${launch.projectName}`,
            });
            if (!soundPlayed && catSettings.sound !== 'none') {
              playSound(catSettings.sound, catSettings.volume);
              soundPlayed = true;
            }
          }
        }
      }

      // Watchlist notification: if the launch is watched, send a separate notification
      // using per-item sound override or falling back to watchlist default
      if (launch && (eventType === 'launch:updated' || eventType === 'launch:cancelled')) {
        const { watchedIds } = useWatchlistStore.getState();
        if (watchedIds.has(launch.id)) {
          const watchlistDefault = getPanelSettings('watchlist');
          if (!watchlistDefault.enabled) return;

          // Per-item override: check if watchlist:<id> has explicit settings
          const itemKey = `watchlist:${launch.id}`;
          const itemOverride = panelSettings[itemKey];
          const sound = itemOverride?.sound ?? watchlistDefault.sound;
          const volume = itemOverride?.volume ?? watchlistDefault.volume;

          pushNotification({
            panelId: 'watchlist',
            panelTitle: 'WATCHLIST',
            message: `${eventType === 'launch:cancelled' ? 'Cancelled' : 'Updated'}: ${launch.projectName}`,
          });

          if (sound !== 'none') {
            playSound(sound, volume);
          }
        }
      }
    }

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
            void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
            if (!parsed.payload.redacted) {
              notifyPanels('launch:new', `New launch: ${parsed.payload.projectName}`, parsed.payload);
            }
          }

          if (parsed.type === 'launch:updated') {
            void queryClient.invalidateQueries({ queryKey: ['launches'] });
            if (!parsed.payload.redacted) {
              queryClient.setQueryData<LaunchRecord>(
                ['launch', parsed.payload.id],
                parsed.payload,
              );
            }
            void queryClient.invalidateQueries({ queryKey: ['calendar'] });
            void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
            if (!parsed.payload.redacted) {
              notifyPanels('launch:updated', `Updated: ${parsed.payload.projectName}`, parsed.payload);
            }
          }

          if (parsed.type === 'launch:cancelled') {
            void queryClient.invalidateQueries({ queryKey: ['launches'] });
            void queryClient.invalidateQueries({ queryKey: ['launch', parsed.payload.id] });
            void queryClient.invalidateQueries({ queryKey: ['calendar'] });
            void queryClient.invalidateQueries({ queryKey: ['intelligence'] });
            notifyPanels('launch:cancelled', `Launch cancelled: ${parsed.payload.id.slice(0, 8)}`);
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
