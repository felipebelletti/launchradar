import { Radio } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useLaunches } from '../../hooks/useLaunches';
import { useAppStore } from '../../store/app.store';
import { PanelShell } from './PanelShell';
import { LaunchRow } from '../cards/LaunchRow';

export function LiveFeedPanel({ onClose }: { onClose?: () => void }) {
  const { data: launches, isLoading } = useLaunches();
  const plan = useAppStore((s) => s.plan);
  const isFree = plan === 'free';

  const sorted = launches?.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const visible = isFree
    ? sorted?.filter((l) => l.status === 'VERIFIED').slice(0, 5)
    : sorted;

  const hiddenCount = isFree && sorted
    ? sorted.length - (visible?.length ?? 0)
    : 0;

  return (
    <PanelShell title="LIVE FEED" icon={Radio} iconColor="text-radar-red" onClose={onClose}>
      {isLoading && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          SCANNING...
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {visible?.map((launch) => (
          <LaunchRow key={launch.id} launch={launch} />
        ))}
      </AnimatePresence>
      {isFree && hiddenCount > 0 && (
        <div className="mt-2 text-center">
          <LaunchRow launch={visible![0]!} locked />
          <p className="text-[10px] font-mono text-radar-muted mt-1">
            +{hiddenCount} signals hidden
          </p>
        </div>
      )}
      {!isLoading && (!sorted || sorted.length === 0) && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          NO SIGNALS IN RANGE
        </div>
      )}
    </PanelShell>
  );
}
