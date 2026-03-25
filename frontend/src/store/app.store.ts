import { create } from 'zustand';
import type { AppMode, Timeframe } from '../types';

// v8: renamed chain panel → platform panel
export const LAYOUT_STORAGE_KEY = 'launchradar:layout:v8';

interface AppStore {
  filters: {
    platforms: Set<string>;
    categories: Set<string>;
    timeframe: Timeframe;
    minFollowers: number | null;
  };
  selectedLaunchId: string | null;
  drawerOpen: boolean;
  pendingCount: number;
  pendingIds: string[];
  highlightedLaunchIds: string[];
  mode: AppMode;
  connected: boolean;
  closedPanels: Set<string>;
  layoutVersion: number;

  togglePlatform: (platform: string) => void;
  toggleCategory: (cat: string) => void;
  setMinFollowers: (n: number | null) => void;
  setTimeframe: (t: Timeframe) => void;
  selectLaunch: (id: string) => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  addPending: (id: string) => void;
  flushPending: () => void;
  setHighlightedLaunchIds: (ids: string[]) => void;
  clearHighlightedLaunchIds: () => void;
  setMode: (mode: AppMode) => void;
  setConnected: (c: boolean) => void;
  closePanel: (id: string) => void;
  restorePanel: (id: string) => void;
  resetPanels: () => void;
  resetLayout: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  filters: {
    platforms: new Set<string>(),
    categories: new Set<string>(),
    timeframe: 'all',
    minFollowers: null,
  },
  selectedLaunchId: null,
  drawerOpen: false,
  pendingCount: 0,
  pendingIds: [],
  highlightedLaunchIds: [],
  mode: 'terminal',
  connected: false,
  closedPanels: new Set<string>(),
  layoutVersion: 0,

  togglePlatform: (platform) =>
    set((s) => {
      const next = new Set(s.filters.platforms);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return { filters: { ...s.filters, platforms: next } };
    }),

  toggleCategory: (cat) =>
    set((s) => {
      const next = new Set(s.filters.categories);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return { filters: { ...s.filters, categories: next } };
    }),

  setMinFollowers: (n) =>
    set((s) => ({ filters: { ...s.filters, minFollowers: n } })),

  setTimeframe: (t) =>
    set((s) => ({ filters: { ...s.filters, timeframe: t } })),

  selectLaunch: (id) => set({ selectedLaunchId: id }),

  openDrawer: (id) => set({ selectedLaunchId: id, drawerOpen: true }),

  closeDrawer: () => set({ drawerOpen: false }),

  addPending: (id) =>
    set((s) => ({
      pendingCount: s.pendingCount + 1,
      pendingIds: [...s.pendingIds, id],
    })),

  flushPending: () => set({ pendingCount: 0, pendingIds: [] }),

  setHighlightedLaunchIds: (ids) =>
    set({ highlightedLaunchIds: [...new Set(ids)] }),

  clearHighlightedLaunchIds: () => set({ highlightedLaunchIds: [] }),

  setMode: (mode) => set({ mode }),

  setConnected: (connected) => set({ connected }),

  closePanel: (id) =>
    set((s) => {
      const next = new Set(s.closedPanels);
      next.add(id);
      return { closedPanels: next };
    }),

  restorePanel: (id) =>
    set((s) => {
      const next = new Set(s.closedPanels);
      next.delete(id);
      return { closedPanels: next };
    }),

  resetPanels: () => set({ closedPanels: new Set<string>() }),

  resetLayout: () => {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
    set((s) => ({ closedPanels: new Set<string>(), layoutVersion: s.layoutVersion + 1 }));
  },
}));
