import { usePlan } from '../../hooks/usePlan';
import { useAuth } from '../../hooks/useAuth';
import type { Plan } from '../../types';

interface NavPlanBadgeProps {
  onClick: () => void;
}

const BADGE_STYLES: Record<string, string> = {
  TRIAL: 'border-amber-400/40 text-amber-400 hover:border-amber-400/60',
  free:  'border-amber-400/20 text-amber-400/50 hover:border-amber-400/35 hover:text-amber-400/70',
  scout: 'border-blue-400/50 text-blue-400 hover:border-blue-400/70',
  alpha: 'border-amber-400/50 text-amber-400 hover:border-amber-400/80',
  pro:   'border-cyan-400/50 text-cyan-400 hover:border-cyan-400/80',
};

export function NavPlanBadge({ onClick }: NavPlanBadgeProps) {
  const { user } = useAuth();
  const { plan, isTrialing } = usePlan();

  if (!user) return null;

  const key = isTrialing ? 'TRIAL' : plan;
  const styles = BADGE_STYLES[key] ?? BADGE_STYLES.free;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono tracking-widest border transition cursor-pointer ${styles}`}
      style={isTrialing ? { boxShadow: '0 0 8px rgba(245, 197, 66, 0.15)' } : undefined}
    >
      {isTrialing && (
        <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
      )}
      {isTrialing ? 'TRIAL' : `◈ ${plan.toUpperCase()}`}
    </button>
  );
}
