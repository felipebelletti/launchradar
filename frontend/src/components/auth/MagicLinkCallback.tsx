import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import type { AuthUser } from '../../store/auth.store';

export function MagicLinkCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('No token provided');
      setVerifying(false);
      return;
    }

    fetch('/auth/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { user?: AuthUser; error?: string };
        if (!res.ok) {
          setError(data.error ?? 'Verification failed');
          return;
        }
        if (data.user) {
          setUser(data.user);
          navigate('/', { replace: true });
        }
      })
      .catch(() => {
        setError('Network error');
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [searchParams, setUser, navigate]);

  return (
    <div className="min-h-screen bg-radar-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <h1 className="font-display text-3xl text-radar-amber tracking-wider">
          ◈ LAUNCHRADAR
        </h1>

        {verifying && (
          <p className="text-radar-muted text-sm animate-pulse">
            Verifying your sign-in link...
          </p>
        )}

        {error && (
          <div className="space-y-4">
            <p className="text-radar-red text-sm">{error}</p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="px-6 py-2.5 rounded-lg bg-radar-amber text-black font-medium text-sm
                hover:bg-radar-amber/90 transition-colors cursor-pointer"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
