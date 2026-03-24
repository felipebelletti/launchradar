import { create } from 'zustand';

const STORAGE_KEY = 'launchradar:calendar-layout';
const DEFAULT_ORDER = ['hour', 'today', 'week', 'live', 'tbd'];

interface CalendarLayoutState {
  order: string[];
  collapsed: Set<string>;
  reorder: (from: number, to: number) => void;
  toggleCollapsed: (key: string) => void;
  reset: () => void;
}

function loadFromStorage(): { order: string[]; collapsed: string[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.order) && Array.isArray(parsed.collapsed)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { order: [...DEFAULT_ORDER], collapsed: [] };
}

function persist(order: string[], collapsed: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, collapsed: [...collapsed] }));
}

const initial = loadFromStorage();

export const useCalendarStore = create<CalendarLayoutState>((set) => ({
  order: initial.order,
  collapsed: new Set(initial.collapsed),

  reorder: (from, to) =>
    set((s) => {
      const next = [...s.order];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      persist(next, s.collapsed);
      return { order: next };
    }),

  toggleCollapsed: (key) =>
    set((s) => {
      const next = new Set(s.collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist(s.order, next);
      return { collapsed: next };
    }),

  reset: () => {
    const order = [...DEFAULT_ORDER];
    const collapsed = new Set<string>();
    persist(order, collapsed);
    return set({ order, collapsed });
  },
}));
