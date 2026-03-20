import { useAppStore } from '../../store/app.store';
import { useLaunches } from '../../hooks/useLaunches';
import { PanelShell } from './PanelShell';
import { GatedContent } from '../shared/GatedContent';
import type { LaunchStatus } from '../../types';

const STATUS_COLORS: Record<LaunchStatus, string> = {
  STUB: '#FF4444',
  PARTIAL: '#F5A623',
  CONFIRMED: '#F5C542',
  VERIFIED: '#00D4FF',
  LIVE: '#22C55E',
  STALE: '#333',
  CANCELLED: '#333',
};

export function HeatmapPanel({ onClose }: { onClose?: () => void }) {
  const { data: launches } = useLaunches();
  const plan = useAppStore((s) => s.plan);
  const openDrawer = useAppStore((s) => s.openDrawer);

  const sorted = launches?.slice().sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const content = (
    <div className="flex flex-wrap gap-1">
      {sorted?.map((l) => (
        <div
          key={l.id}
          onClick={() => openDrawer(l.id)}
          className="w-4 h-4 rounded-sm cursor-pointer hover:scale-125 transition-transform"
          style={{ backgroundColor: STATUS_COLORS[l.status] }}
          title={l.projectName}
        />
      ))}
      {(!sorted || sorted.length === 0) && (
        <p className="text-[10px] font-mono text-radar-muted/50 w-full text-center py-4">
          NO DATA
        </p>
      )}
    </div>
  );

  return (
    <PanelShell title="CONFIDENCE HEATMAP" onClose={onClose}>
      <GatedContent requiredPlan="alpha" currentPlan={plan} ctaText="CLASSIFIED \u2014 ALPHA FEATURE">
        {content}
      </GatedContent>
    </PanelShell>
  );
}
