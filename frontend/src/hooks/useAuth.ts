import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth.store';
import type { AuthUser } from '../store/auth.store';
import { getDeviceFingerprint } from '../lib/fingerprint';

export function useAuth() {
  const { user, isLoading, isAuthenticated, setUser, setLoading, logout } =
    useAuthStore();
  const trialActivated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchMe() {
      let delay = 1000;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (cancelled) return;
        try {
          const res = await fetch('/auth/me', { credentials: 'include' });
          if (res.status === 401) {
            // Genuinely unauthenticated — no retry
            if (!cancelled) setUser(null);
            return;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { user: AuthUser };
          if (!cancelled) setUser(data.user);
          return;
        } catch {
          // Network error or server error — backend is likely restarting, keep trying
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.min(delay * 1.5, 5000); // back off up to 5s
        }
      }
    }

    // Only fetch if we haven't loaded yet
    if (isLoading) {
      fetchMe();
    }

    return () => {
      cancelled = true;
    };
  }, [isLoading, setUser, setLoading]);

  // Activate trial on first dashboard visit
  useEffect(() => {
    if (!user || trialActivated.current) return;
    if (user.trialUsed || user.plan !== 'free') return;
    trialActivated.current = true;

    getDeviceFingerprint()
      .then((fingerprint) =>
        fetch('/auth/trial/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fingerprint }),
        }),
      )
      .catch(() => {});
  }, [user]);

  return { user, isLoading, isAuthenticated, logout };
}
