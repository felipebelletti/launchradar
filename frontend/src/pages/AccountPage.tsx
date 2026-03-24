import { useState, useEffect } from 'react';
import { ArrowLeft, Wallet, Twitter, Mail, ExternalLink } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePlan, PLAN_RANK } from '../hooks/usePlan';
import { useWatchlistStore } from '../store/watchlist.store';
import { UpgradeButton } from '../components/shared/UpgradeButton';
import { SessionsPanel } from '../components/auth/SessionsPanel';
import type { Plan } from '../types';

const PLAN_PRICES: Record<Plan, string> = {
  free: '$0',
  scout: '$19',
  alpha: '$49',
  pro: '$99',
};

const PLAN_FEATURES: Record<Plan, string[]> = {
  free: ['5 watchlist', '48h delay'],
  scout: ['25 watchlist', 'Real-time', 'Source tweets', 'Terminal mode'],
  alpha: ['100 watchlist', 'Real-time', 'Telegram alerts', 'Week view'],
  pro: ['Unlimited watchlist', 'API access', 'Discord alerts', 'Webhooks'],
};

type Tab = 'profile' | 'billing' | 'sessions';

interface AccountPageProps {
  initialTab?: Tab;
  onBack: () => void;
}

export function AccountPage({ initialTab = 'profile', onBack }: AccountPageProps) {
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <span className="font-display text-white text-lg tracking-widest">LAUNCHRADAR</span>
        <button
          onClick={onBack}
          className="text-white/40 hover:text-white/70 text-xs font-mono
                     tracking-wide transition flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft size={11} />
          Back to dashboard
        </button>
      </div>

      {/* Tab nav */}
      <div className="border-b border-white/[0.06] px-6">
        <div className="flex gap-0 max-w-2xl mx-auto">
          {(['profile', 'billing', 'sessions'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-[11px] font-mono tracking-widest uppercase
                border-b-2 transition -mb-px cursor-pointer ${
                  tab === t
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-white/30 hover:text-white/50'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'billing' && <BillingTab />}
        {tab === 'sessions' && <SessionsTab />}
      </div>
    </div>
  );
}

/* ─── Profile Tab ───────────────────────────────────────── */

function ProfileTab() {
  const { user } = useAuth();
  const { plan, isTrialing, trialHoursRemaining } = usePlan();
  const watchedIds = useWatchlistStore((s) => s.watchedIds);

  return (
    <div className="space-y-8">
      {/* Connected accounts */}
      <div>
        <h3 className="text-white/40 text-[10px] font-mono tracking-widest uppercase mb-4">
          Connected accounts
        </h3>
        <div className="space-y-2">
          {user?.walletAddress && (
            <AccountRow
              icon={Wallet}
              label="Wallet"
              value={`${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`}
            />
          )}
          {user?.twitterHandle && (
            <AccountRow icon={Twitter} label="Twitter" value={`@${user.twitterHandle}`} />
          )}
          {user?.email && (
            <AccountRow icon={Mail} label="Email" value={user.email} />
          )}
        </div>
      </div>

      {/* Plan card */}
      <div>
        <h3 className="text-white/40 text-[10px] font-mono tracking-widest uppercase mb-4">
          Current plan
        </h3>
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
          {isTrialing ? (
            <>
              <span className="text-amber-400 text-sm font-mono tracking-wider font-bold">
                ALPHA TRIAL
              </span>
              <p className="text-white/40 text-xs mt-1">
                Expires in {trialHoursRemaining}h
              </p>
              <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-amber-400/60 rounded-full"
                  style={{
                    width: `${Math.min(100, ((72 - (trialHoursRemaining ?? 0)) / 72) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-4">
                <UpgradeButton targetPlan="alpha" />
              </div>
            </>
          ) : (
            <>
              <span className="text-white text-sm font-mono tracking-wider font-bold">
                {plan.toUpperCase()} PLAN
              </span>
              {plan !== 'free' && (
                <p className="text-white/40 text-xs mt-1">
                  {PLAN_PRICES[plan]}/month
                </p>
              )}
              <p className="text-white/30 text-xs mt-2">
                Watchlist: {watchedIds.size} used
              </p>
              <div className="mt-4 flex gap-2">
                {plan === 'free' ? (
                  <UpgradeButton targetPlan="scout" />
                ) : plan !== 'pro' ? (
                  <UpgradeButton targetPlan={plan === 'scout' ? 'alpha' : 'pro'} />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
      <Icon size={14} className="text-white/30" />
      <div className="flex-1 min-w-0">
        <span className="text-white/40 text-[10px] font-mono tracking-wide">{label}</span>
        <p className="text-white text-sm truncate">{value}</p>
      </div>
    </div>
  );
}

/* ─── Billing Tab ───────────────────────────────────────── */

function BillingTab() {
  const { plan, isTrialing } = usePlan();
  const [billingStatus, setBillingStatus] = useState<{
    subscription: {
      status: string;
      plan: string;
      currentPeriodEnd: string;
      cancelAtPeriodEnd: boolean;
    } | null;
  } | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetch('/billing/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setBillingStatus(d as typeof billingStatus))
      .catch(() => {});
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch('/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setPortalLoading(false);
    }
  }

  const sub = billingStatus?.subscription;
  const hasSub = sub && sub.status !== 'CANCELLED';

  return (
    <div className="space-y-8">
      {/* Current subscription */}
      <div>
        <h3 className="text-white/40 text-[10px] font-mono tracking-widest uppercase mb-4">
          Subscription
        </h3>
        {hasSub ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-mono font-bold tracking-wider">
                {sub.plan} — {PLAN_PRICES[(sub.plan.toLowerCase() as Plan)] ?? sub.plan}/mo
              </span>
              <span
                className={`text-[10px] font-mono tracking-wider ${
                  sub.status === 'ACTIVE' ? 'text-green-400' : 'text-amber-400'
                }`}
              >
                {sub.status}
              </span>
            </div>
            <p className="text-white/30 text-xs">
              {sub.cancelAtPeriodEnd
                ? `Cancels on ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                : `Next renewal: ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-white/50
                           hover:text-white bg-white/[0.05] hover:bg-white/[0.08] rounded
                           transition cursor-pointer disabled:opacity-50"
              >
                <ExternalLink size={11} />
                {portalLoading ? 'Loading...' : 'Manage subscription'}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
            <p className="text-white/40 text-sm">
              {isTrialing ? 'Your trial is active — no subscription yet.' : 'No active subscription.'}
            </p>
            <div className="mt-3">
              <UpgradeButton targetPlan="scout" />
            </div>
          </div>
        )}
      </div>

      {/* Plan comparison */}
      <div>
        <h3 className="text-white/40 text-[10px] font-mono tracking-widest uppercase mb-4">
          Plan comparison
        </h3>
        <div className="space-y-1">
          {(['free', 'scout', 'alpha', 'pro'] as const).map((p) => {
            const isCurrent = plan === p;
            return (
              <div
                key={p}
                className={`flex items-center gap-4 px-4 py-2.5 rounded text-xs font-mono ${
                  isCurrent
                    ? 'bg-amber-400/[0.06] border-l-2 border-amber-400'
                    : 'bg-white/[0.02] border-l-2 border-transparent'
                }`}
              >
                <span className={`w-14 tracking-wider ${isCurrent ? 'text-amber-400 font-bold' : 'text-white/50'}`}>
                  {p.toUpperCase()}
                </span>
                <span className="w-16 text-white/30">{PLAN_PRICES[p]}/mo</span>
                <span className="text-white/20 flex-1">
                  {PLAN_FEATURES[p].join(' · ')}
                </span>
                {isCurrent && (
                  <span className="text-amber-400/70 text-[10px] tracking-widest">CURRENT</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Sessions Tab ──────────────────────────────────────── */

function SessionsTab() {
  return <SessionsPanel />;
}
