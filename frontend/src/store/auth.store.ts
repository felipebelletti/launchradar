import { create } from 'zustand';

export interface AuthUser {
  id: string;
  walletAddress: string | null;
  twitterHandle: string | null;
  twitterAvatar: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  plan: 'free' | 'scout' | 'alpha' | 'pro';
  trialExpiresAt: string | null;
  trialUsed: boolean;
}

interface AuthStore {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  logout: async () => {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false });
  },
}));
