import { Eye } from 'lucide-react';
import { PanelShell } from './PanelShell';
import { GatedContent } from '../shared/GatedContent';
import { useAppStore } from '../../store/app.store';

export function WatchlistPanel({ onClose }: { onClose?: () => void }) {
  const plan = useAppStore((s) => s.plan);

  return (
    <PanelShell
      title="WATCHLIST"
      icon={Eye}
      iconColor="text-sky-400"
      onClose={onClose}
      className="border-cyan-500/25 bg-[linear-gradient(180deg,rgba(5,40,72,0.32)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(0,212,255,0.1)]"
    >
      <GatedContent requiredPlan="scout" currentPlan={plan} ctaText="CLASSIFIED \u2014 UPGRADE TO SCOUT">
        <div className="flex items-center justify-center h-full min-h-[120px] text-center px-2">
          <p className="text-[10px] font-mono font-bold tracking-widest text-cyan-300/85 whitespace-nowrap">
            NO HANDLES WATCHED
          </p>
        </div>
      </GatedContent>
    </PanelShell>
  );
}
