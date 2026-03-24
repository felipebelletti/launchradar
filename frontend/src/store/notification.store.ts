import { create } from 'zustand';

const STORAGE_KEY = 'launchradar:notifications';

export type NotificationSound = 'ping' | 'radar' | 'alert' | 'chime' | 'blip' | 'none';

export interface PanelNotificationSettings {
  enabled: boolean;
  sound: NotificationSound;
  volume: number; // 0–1
}

export interface Notification {
  id: string;
  panelId: string;
  panelTitle: string;
  message: string;
  timestamp: number;
}

interface NotificationStore {
  /** Per-panel notification settings keyed by panel ID */
  panelSettings: Record<string, PanelNotificationSettings>;

  /** Active notifications (toast queue) */
  notifications: Notification[];

  setPanelSettings: (panelId: string, settings: Partial<PanelNotificationSettings>) => void;
  getPanelSettings: (panelId: string) => PanelNotificationSettings;
  pushNotification: (n: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
  clearAll: () => void;
}

const DEFAULT_SETTINGS: PanelNotificationSettings = {
  enabled: true,
  sound: 'ping',
  volume: 0.5,
};

/** Category notifications are opt-in (disabled by default) */
const DEFAULT_CATEGORY_SETTINGS: PanelNotificationSettings = {
  enabled: false,
  sound: 'radar',
  volume: 0.5,
};

function loadSettings(): Record<string, PanelNotificationSettings> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as Record<string, PanelNotificationSettings>;
  } catch { /* use default */ }
  return {};
}

function saveSettings(settings: Record<string, PanelNotificationSettings>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  panelSettings: loadSettings(),
  notifications: [],

  setPanelSettings: (panelId, partial) => {
    set((s) => {
      const defaults = panelId.startsWith('category:') ? DEFAULT_CATEGORY_SETTINGS : DEFAULT_SETTINGS;
      const current = s.panelSettings[panelId] ?? defaults;
      const updated = { ...s.panelSettings, [panelId]: { ...current, ...partial } };
      saveSettings(updated);
      return { panelSettings: updated };
    });
  },

  getPanelSettings: (panelId) => {
    const defaults = panelId.startsWith('category:') ? DEFAULT_CATEGORY_SETTINGS : DEFAULT_SETTINGS;
    return get().panelSettings[panelId] ?? defaults;
  },

  pushNotification: (n) => {
    const notification: Notification = {
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    set((s) => ({
      notifications: [...s.notifications, notification].slice(-10), // keep last 10
    }));
  },

  dismissNotification: (id) => {
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => set({ notifications: [] }),
}));
