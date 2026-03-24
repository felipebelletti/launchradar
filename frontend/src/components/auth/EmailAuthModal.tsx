import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import type { AuthUser } from '../../store/auth.store';

interface Props {
  onClose: () => void;
}

export function EmailAuthModal({ onClose }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint =
        tab === 'login' ? '/auth/email/login' : '/auth/email/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }

      if (data.user) {
        setUser(data.user);
        onClose();
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-radar-bg border border-radar-border rounded-xl w-full max-w-sm p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-radar-text font-medium">
            {tab === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
          <button
            onClick={onClose}
            className="text-radar-muted hover:text-radar-text cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setTab('login')}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
              tab === 'login'
                ? 'bg-white/10 text-radar-text'
                : 'text-radar-muted hover:text-radar-text'
            }`}
          >
            Login
          </button>
          <button
            onClick={() => setTab('register')}
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
              tab === 'register'
                ? 'bg-white/10 text-radar-text'
                : 'text-radar-muted hover:text-radar-text'
            }`}
          >
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10
              text-radar-text placeholder:text-radar-muted text-sm
              focus:outline-none focus:border-radar-amber/50"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10
              text-radar-text placeholder:text-radar-muted text-sm
              focus:outline-none focus:border-radar-amber/50"
          />

          {error && (
            <p className="text-radar-red text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-radar-amber text-black font-medium text-sm
              hover:bg-radar-amber/90 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading
              ? 'Loading...'
              : tab === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
