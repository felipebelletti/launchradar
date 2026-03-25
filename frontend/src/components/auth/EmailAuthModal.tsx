import { useState, useEffect } from 'react';
import { X, Mail, ArrowLeft } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export function EmailAuthModal({ onClose }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/auth/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Something went wrong');
        return;
      }

      setSent(true);
      setCooldown(60);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (cooldown > 0) return;
    handleSend();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-radar-bg border border-radar-border rounded-xl w-full max-w-sm p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-radar-text font-medium">
            {sent ? 'Check your email' : 'Sign in with email'}
          </h2>
          <button
            onClick={onClose}
            className="text-radar-muted hover:text-radar-text cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {!sent ? (
          /* Step 1: Email input */
          <form onSubmit={handleSend} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10
                text-radar-text placeholder:text-radar-muted text-sm
                focus:outline-none focus:border-radar-amber/50"
            />

            {error && <p className="text-radar-red text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-radar-amber text-black font-medium text-sm
                hover:bg-radar-amber/90 disabled:opacity-50 transition-colors cursor-pointer
                flex items-center justify-center gap-2"
            >
              {loading ? (
                'Sending...'
              ) : (
                <>
                  <Mail size={16} />
                  Send magic link
                </>
              )}
            </button>
          </form>
        ) : (
          /* Step 2: Confirmation */
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
              <Mail size={32} className="mx-auto text-radar-amber mb-3" />
              <p className="text-radar-text text-sm mb-1">
                We sent a sign-in link to
              </p>
              <p className="text-radar-amber text-sm font-medium">{email}</p>
            </div>

            <p className="text-radar-muted text-xs text-center">
              Click the link in your email to sign in. The link expires in 15 minutes.
            </p>

            {error && <p className="text-radar-red text-sm text-center">{error}</p>}

            <button
              onClick={handleResend}
              disabled={cooldown > 0}
              className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10
                text-radar-text text-sm hover:bg-white/10 disabled:opacity-50
                transition-colors cursor-pointer"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
            </button>

            <button
              onClick={() => {
                setSent(false);
                setError('');
              }}
              className="w-full flex items-center justify-center gap-1.5 text-radar-muted
                text-sm hover:text-radar-text transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} />
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
