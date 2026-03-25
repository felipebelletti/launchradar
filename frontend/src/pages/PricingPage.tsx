import { useState } from 'react';
import { Check, X, ArrowLeft } from 'lucide-react';
import { usePlan } from '../hooks/usePlan';
import { useAuthStore } from '../store/auth.store';
import type { AuthUser } from '../store/auth.store';
import { getDeviceFingerprint } from '../lib/fingerprint';
import type { Plan } from '../types';

const PLAN_RANK: Record<Plan, number> = { free: 0, scout: 1, alpha: 2, pro: 3 };

interface PlanTier {
  id: Plan;
  name: string;
  price: string;
  period: string;
  cta: string;
  popular?: boolean;
  trialNote?: string;
  features: { label: string; included: boolean }[];
}

const PLANS: PlanTier[] = [
  {
    id: 'free',
    name: 'FREE',
    price: '$0',
    period: '/mo',
    cta: 'Get started free',
    features: [
      { label: 'Launch feed (48h delay)', included: true },
      { label: 'Calendar: Next Hour + Today (delayed)', included: true },
      { label: 'Calendar: This Week', included: false },
      { label: 'Calendar: TBD column', included: false },
      { label: 'Calendar grid: month view', included: true },
      { label: 'Calendar grid: week view', included: false },
      { label: 'Platform & category filters', included: true },
      { label: 'Source tweets panel', included: false },
      { label: 'Watchlist (5 accounts)', included: true },
      { label: 'Terminal mode', included: false },
      { label: 'Telegram alerts', included: false },
      { label: 'Discord alerts', included: false },
      { label: 'Custom webhooks', included: false },
      { label: 'API access', included: false },
    ],
  },
  {
    id: 'scout',
    name: 'SCOUT',
    price: '$19',
    period: '/mo',
    cta: 'Subscribe',
    features: [
      { label: 'Launch feed (real-time)', included: true },
      { label: 'Calendar: Next Hour + Today', included: true },
      { label: 'Calendar: This Week', included: true },
      { label: 'Calendar: TBD column', included: false },
      { label: 'Calendar grid: month view', included: true },
      { label: 'Calendar grid: week view', included: false },
      { label: 'Platform & category filters', included: true },
      { label: 'Source tweets panel', included: true },
      { label: 'Watchlist (25 accounts)', included: true },
      { label: 'Terminal mode', included: true },
      { label: 'Telegram alerts', included: false },
      { label: 'Discord alerts', included: false },
      { label: 'Custom webhooks', included: false },
      { label: 'API access', included: false },
    ],
  },
  {
    id: 'alpha',
    name: 'ALPHA',
    price: '$49',
    period: '/mo',
    cta: 'Start 3-day free trial',
    trialNote: '3-day free trial \u00b7 No card required',
    popular: true,
    features: [
      { label: 'Launch feed (real-time)', included: true },
      { label: 'Calendar: Next Hour + Today', included: true },
      { label: 'Calendar: This Week', included: true },
      { label: 'Calendar: TBD column', included: true },
      { label: 'Calendar grid: month view', included: true },
      { label: 'Calendar grid: week view', included: true },
      { label: 'Platform & category filters', included: true },
      { label: 'Source tweets panel', included: true },
      { label: 'Watchlist (100 accounts)', included: true },
      { label: 'Terminal mode', included: true },
      { label: 'Telegram alerts', included: true },
      { label: 'Discord alerts', included: false },
      { label: 'Custom webhooks', included: false },
      { label: 'API access', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'PRO',
    price: '$99',
    period: '/mo',
    cta: 'Subscribe',
    features: [
      { label: 'Launch feed (real-time)', included: true },
      { label: 'Calendar: Next Hour + Today', included: true },
      { label: 'Calendar: This Week', included: true },
      { label: 'Calendar: TBD column', included: true },
      { label: 'Calendar grid: month view', included: true },
      { label: 'Calendar grid: week view', included: true },
      { label: 'Platform & category filters', included: true },
      { label: 'Source tweets panel', included: true },
      { label: 'Watchlist (unlimited)', included: true },
      { label: 'Terminal mode', included: true },
      { label: 'Telegram alerts', included: true },
      { label: 'Discord alerts', included: true },
      { label: 'Custom webhooks', included: true },
      { label: 'API access', included: true },
    ],
  },
];

export function PricingPage({ onBack }: { onBack?: () => void }) {
  const { plan: currentPlan } = usePlan();
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState<Plan | null>(null);

  const trialEligible = !!user && !user.trialUsed && !user.trialExpiresAt;

  async function handleUpgrade(plan: Plan) {
    if (plan === 'free') return;
    setLoading(plan);
    try {
      // ALPHA plan: activate free trial if user hasn't used it yet
      if (plan === 'alpha' && user && !user.trialUsed && !user.trialExpiresAt) {
        const fingerprint = await getDeviceFingerprint();
        const res = await fetch('/auth/trial/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fingerprint }),
        });
        if (res.ok) {
          // Refetch user to pick up the active trial
          const meRes = await fetch('/auth/me', { credentials: 'include' });
          if (meRes.ok) {
            const { user: updated } = (await meRes.json()) as { user: AuthUser };
            setUser(updated);
          }
          setLoading(null);
          return;
        }
        // Fall through to checkout if trial activation fails
      }

      const res = await fetch('/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ plan: plan.toUpperCase() }),
      });
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-radar-bg">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-radar-muted hover:text-radar-text text-sm mb-6 cursor-pointer"
          >
            <ArrowLeft size={14} />
            Back to dashboard
          </button>
        )}
        <div className="text-center mb-12">
          <h1 className="font-display text-2xl text-radar-amber tracking-wider mb-2">
            LAUNCHRADAR
          </h1>
          <p className="text-radar-muted text-sm font-mono">
            Real-time crypto launch intelligence
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((tier) => {
            const isCurrent = currentPlan === tier.id;
            const isHigher = PLAN_RANK[tier.id] > PLAN_RANK[currentPlan];

            return (
              <div
                key={tier.id}
                className={`relative rounded-xl border p-5 flex flex-col ${
                  tier.popular
                    ? 'border-amber-400/40 bg-amber-400/5'
                    : 'border-radar-border bg-radar-panel'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2
                    bg-amber-400 text-black text-[10px] font-bold tracking-widest
                    px-3 py-0.5 rounded-full">
                    MOST POPULAR
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-radar-text font-mono text-sm font-bold tracking-wider">
                    {tier.name}
                  </h3>
                  <div className="mt-2">
                    <span className="text-2xl font-bold text-radar-text">{tier.price}</span>
                    <span className="text-radar-muted text-sm">{tier.period}</span>
                  </div>
                </div>

                {/* Features */}
                <div className="flex-1 space-y-2 mb-5">
                  {tier.features.map((f) => (
                    <div key={f.label} className="flex items-center gap-2 text-xs">
                      {f.included ? (
                        <Check size={12} className="text-cyan-400 shrink-0" />
                      ) : (
                        <X size={12} className="text-white/20 shrink-0" />
                      )}
                      <span className={f.included ? 'text-radar-text' : 'text-white/20'}>
                        {f.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA + note — fixed height so cards stay aligned */}
                <div className="h-[52px] flex flex-col items-center">
                  <button
                    onClick={() => handleUpgrade(tier.id)}
                    disabled={isCurrent || loading === tier.id || (!isHigher && tier.id !== 'free')}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold tracking-wider transition cursor-pointer ${
                      isCurrent
                        ? 'bg-white/10 text-radar-muted cursor-default'
                        : tier.popular
                          ? 'bg-amber-400 text-black hover:bg-amber-300'
                          : 'bg-white/10 text-radar-text hover:bg-white/20'
                    } disabled:opacity-50`}
                  >
                    {isCurrent
                      ? 'CURRENT PLAN'
                      : loading === tier.id
                        ? 'Redirecting...'
                        : tier.id === 'alpha' && !trialEligible
                          ? 'Subscribe'
                          : tier.cta}
                  </button>
                  {tier.id === 'alpha' && !isCurrent && (
                    <p className="text-center text-[10px] text-radar-muted mt-1.5">
                      {trialEligible
                        ? tier.trialNote
                        : 'Free trial already used'}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
