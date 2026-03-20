import { Lock } from 'lucide-react';
import type { Plan } from '../../types';
import type { ReactNode } from 'react';

const planRank: Record<Plan, number> = { free: 0, scout: 1, alpha: 2, pro: 3 };

export function GatedContent({
  requiredPlan,
  currentPlan,
  children,
  ctaText = 'Upgrade to unlock',
}: {
  requiredPlan: Plan;
  currentPlan: Plan;
  children: ReactNode;
  ctaText?: string;
}) {
  if (planRank[currentPlan] >= planRank[requiredPlan]) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="pointer-events-none select-none" style={{ filter: 'blur(8px)', opacity: 0.4 }}>
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm rounded">
        <Lock className="text-radar-amber mb-2" size={20} />
        <span className="text-radar-amber text-sm font-medium">{ctaText}</span>
        <button className="mt-3 px-4 py-1.5 bg-radar-amber text-black text-xs font-bold rounded hover:opacity-80 transition">
          UPGRADE TO {requiredPlan.toUpperCase()}
        </button>
      </div>
    </div>
  );
}
