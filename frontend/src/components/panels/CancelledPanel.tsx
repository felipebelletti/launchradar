import { Ban } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useCancelledLaunches } from '../../hooks/useCancelledLaunches';
import { PanelShell } from './PanelShell';
import { LaunchRow } from '../cards/LaunchRow';

export function CancelledPanel({ onClose }: { onClose?: () => void }) {
  const { data: launches, isLoading } = useCancelledLaunches();

  const sorted = launches?.slice().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <PanelShell
      title="CANCELLED LAUNCHES"
      panelId="cancelled"
      icon={Ban}
      iconColor="text-rose-400"
      onClose={onClose}
      className="border-rose-500/25 bg-[linear-gradient(180deg,rgba(76,5,25,0.22)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(244,63,94,0.08)]"
    >
      {isLoading && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          SCANNING...
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {sorted?.map((launch) => (
          <LaunchRow key={launch.id} launch={launch} />
        ))}
      </AnimatePresence>
      {!isLoading && (!sorted || sorted.length === 0) && (
        <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-center px-2">
          <p className="text-[10px] font-mono font-bold tracking-widest text-rose-400/80 mb-2">
            NO CANCELLED LAUNCHES
          </p>
          <div className="w-full min-w-0 overflow-x-auto flex justify-center">
            <p className="text-[10px] font-mono text-radar-muted/70 whitespace-nowrap">
              Projects marked cancelled appear here.
            </p>
          </div>
        </div>
      )}
    </PanelShell>
  );
}
