import { Eye } from 'lucide-react';
import { PanelShell } from './PanelShell';
import { GatedContent } from '../shared/GatedContent';
import { useAppStore } from '../../store/app.store';

export function WatchlistPanel({ onClose }: { onClose?: () => void }) {
  const plan = useAppStore((s) => s.plan);

  return (
    <PanelShell title="WATCHLIST" icon={Eye} iconColor="text-radar-cyan" onClose={onClose}>
      <GatedContent requiredPlan="scout" currentPlan={plan} ctaText="CLASSIFIED \u2014 UPGRADE TO SCOUT">
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          NO HANDLES WATCHED
        </div>
      </GatedContent>
    </PanelShell>
  );
}
