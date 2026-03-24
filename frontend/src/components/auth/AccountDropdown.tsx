import { useState } from 'react';
import { User, CreditCard, Monitor, Sparkles, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePlan } from '../../hooks/usePlan';
import { useWatchlistStore } from '../../store/watchlist.store';
import { UpgradeButton } from '../shared/UpgradeButton';
import type { Plan } from '../../types';

function PlanBadge({ plan, isTrialing }: { plan: Plan; isTrialing: boolean }) {
  if (isTrialing) {
    return (
      <span className="text-amber-400 text-[10px] font-mono tracking-widest mt-0.5 block">
        ALPHA TRIAL
      </span>
    );
  }

  const colors: Record<Plan, string> = {
    free: 'text-white/30',
    scout: 'text-blue-400',
    alpha: 'text-amber-400',
    pro: 'text-cyan-400',
  };

  return (
    <span className={`text-[10px] font-mono tracking-widest mt-0.5 block ${colors[plan]}`}>
      {plan.toUpperCase()} PLAN
    </span>
  );
}

function UsageStat({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit === Infinity ? 0 : Math.min(100, (used / limit) * 100);
  const isNearLimit = pct >= 80;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-white/40 text-[10px] font-mono tracking-wide">
          {label}
        </span>
        <span
          className={`text-[10px] font-mono ${
            isNearLimit ? 'text-amber-400' : 'text-white/30'
          }`}
        >
          {limit === Infinity ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      {limit !== Infinity && (
        <div className="h-0.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isNearLimit ? 'bg-amber-400/60' : 'bg-white/20'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function DropdownLink({
  onClick,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 py-2 text-white/50
                 hover:text-white hover:bg-white/[0.03] transition
                 text-xs font-mono tracking-wide cursor-pointer"
    >
      <Icon size={12} className="flex-shrink-0" />
      {children}
    </button>
  );
}

function nextPlan(current: Plan): Plan {
  const order: Plan[] = ['free', 'scout', 'alpha', 'pro'];
  const idx = order.indexOf(current);
  return order[Math.min(idx + 1, order.length - 1)];
}

interface AccountDropdownProps {
  onClose: () => void;
  onNavigate: (path: string) => void;
}

export function AccountDropdown({ onClose, onNavigate }: AccountDropdownProps) {
  const { user, logout } = useAuth();
  const { plan, isTrialing, trialHoursRemaining, watchlistLimit } = usePlan();
  const watchedIds = useWatchlistStore((s) => s.watchedIds);
  const [signingOut, setSigningOut] = useState(false);

  const watchlistCount = watchedIds.size;

  function handleNav(path: string) {
    onClose();
    onNavigate(path);
  }

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
    onClose();
  }

  return (
    <div className="absolute right-0 top-full mt-2 w-64 rounded-lg
                    border border-white/[0.08] bg-[#0D0D14]
                    shadow-xl shadow-black/50 z-50 overflow-hidden">
      {/* Header — identity */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <p className="text-white text-sm font-medium truncate">
          {user?.twitterHandle
            ? `@${user.twitterHandle}`
            : user?.walletAddress
              ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
              : user?.email ?? 'Anonymous'}
        </p>
        <PlanBadge plan={plan} isTrialing={isTrialing} />
      </div>

      {/* Trial block */}
      {isTrialing && (
        <div className="px-4 py-3 border-b border-white/[0.06] bg-amber-400/[0.04]">
          <div className="flex items-center justify-between">
            <span className="text-amber-400 text-[11px] font-mono tracking-widest">
              TRIAL ACTIVE
            </span>
            <span className="text-amber-400/70 text-[11px] font-mono">
              {trialHoursRemaining}h left
            </span>
          </div>
          <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-amber-400/60 rounded-full transition-all"
              style={{
                width: `${Math.min(100, ((72 - (trialHoursRemaining ?? 0)) / 72) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Usage stats */}
      <div className="px-4 py-3 border-b border-white/[0.06] space-y-2">
        <UsageStat label="Watchlist" used={watchlistCount} limit={watchlistLimit} />
      </div>

      {/* Upgrade CTA */}
      {plan !== 'pro' && (
        <div className="px-4 py-3 border-b border-white/[0.06]">
          {isTrialing ? (
            <UpgradeButton targetPlan="alpha" className="w-full" />
          ) : plan === 'free' ? (
            <UpgradeButton targetPlan="scout" className="w-full" />
          ) : (
            <UpgradeButton targetPlan={nextPlan(plan)} className="w-full" />
          )}
        </div>
      )}

      {/* Nav links */}
      <div className="py-1">
        <DropdownLink onClick={() => handleNav('/account')} icon={User}>
          Account settings
        </DropdownLink>
        <DropdownLink onClick={() => handleNav('/account/billing')} icon={CreditCard}>
          Billing
        </DropdownLink>
        <DropdownLink onClick={() => handleNav('/account/sessions')} icon={Monitor}>
          Sessions
        </DropdownLink>
        <DropdownLink onClick={() => handleNav('/pricing')} icon={Sparkles}>
          View all plans
        </DropdownLink>
      </div>

      {/* Sign out */}
      <div className="border-t border-white/[0.06] py-1">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-2.5 px-4 py-2
                     text-red-400/70 hover:text-red-400 hover:bg-red-400/5
                     transition text-xs font-mono tracking-wide cursor-pointer
                     disabled:opacity-50"
        >
          <LogOut size={12} />
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
