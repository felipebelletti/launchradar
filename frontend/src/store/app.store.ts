import { create } from 'zustand';
import type { AppMode, Plan, Timeframe } from '../types';

export const LAYOUT_STORAGE_KEY = 'launchradar:layout:v2';

interface AppStore {
  filters: {
    chains: Set<string>;
    categories: Set<string>;
    timeframe: Timeframe;
  };
  selectedLaunchId: string | null;
  drawerOpen: boolean;
  pendingCount: number;
  pendingIds: string[];
  highlightedLaunchIds: string[];
  mode: AppMode;
  plan: Plan;
  connected: boolean;
  closedPanels: Set<string>;
  layoutVersion: number;

  toggleChain: (chain: string) => void;
  toggleCategory: (cat: string) => void;
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
    chains: new Set<string>(),
    categories: new Set<string>(),
    timeframe: 'all',
  },
  selectedLaunchId: null,
  drawerOpen: false,
  pendingCount: 0,
  pendingIds: [],
  highlightedLaunchIds: [],
  mode: 'terminal',
  plan: 'alpha',
  connected: false,
  closedPanels: new Set<string>(),
  layoutVersion: 0,

  toggleChain: (chain) =>
    set((s) => {
      const next = new Set(s.filters.chains);
      if (next.has(chain)) next.delete(chain);
      else next.add(chain);
      return { filters: { ...s.filters, chains: next } };
    }),

  toggleCategory: (cat) =>
    set((s) => {
      const next = new Set(s.filters.categories);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return { filters: { ...s.filters, categories: next } };
    }),

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
