import { create } from 'zustand';

const STORAGE_KEY = 'launchradar:watchlist';

interface WatchlistStore {
  watchedIds: Set<string>;
  toggleWatch: (id: string) => void;
  isWatched: (id: string) => boolean;
}

function load(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return new Set(JSON.parse(saved) as string[]);
  } catch { /* use default */ }
  return new Set();
}

function save(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  watchedIds: load(),

  toggleWatch: (id) => {
    set((s) => {
      const next = new Set(s.watchedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save(next);
      return { watchedIds: next };
    });
  },

  isWatched: (id) => get().watchedIds.has(id),
}));
