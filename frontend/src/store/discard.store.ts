import { create } from 'zustand';

const STORAGE_KEY = 'launchradar:discarded';

interface DiscardStore {
  discardedIds: Set<string>;
  toggleDiscard: (id: string) => void;
  isDiscarded: (id: string) => boolean;
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

export const useDiscardStore = create<DiscardStore>((set, get) => ({
  discardedIds: load(),

  toggleDiscard: (id) => {
    set((s) => {
      const next = new Set(s.discardedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      save(next);
      return { discardedIds: next };
    });
  },

  isDiscarded: (id) => get().discardedIds.has(id),
}));
