import { usePlan } from '../../hooks/usePlan';
import { UpgradeButton } from '../shared/UpgradeButton';

export function TrialBanner() {
  const { isTrialing, trialHoursRemaining } = usePlan();

  // Only show when <= 24h remaining
  if (!isTrialing || (trialHoursRemaining ?? 99) > 24) return null;

  return (
    <div className="w-full bg-amber-400/10 border-b border-amber-400/20
                    px-4 py-2 flex items-center justify-between">
      <span className="text-amber-400 text-xs font-mono">
        Your trial expires in {trialHoursRemaining}h — upgrade to keep access
      </span>
      <UpgradeButton targetPlan="scout" />
    </div>
  );
}
