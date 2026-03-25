import { Eye, EyeOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelShell } from './PanelShell';
import { WatchlistSettingsPopover } from './WatchlistSettingsPopover';
import { GatedContent } from '../shared/GatedContent';
import { UpgradeButton } from '../shared/UpgradeButton';
import { PlatformTag } from '../shared/PlatformTag';
import { StatusBadge } from '../shared/StatusBadge';
import { WatchItemSettings } from '../shared/WatchItemSettings';
import { useAppStore } from '../../store/app.store';
import { useWatchlistStore } from '../../store/watchlist.store';
import { useLaunches } from '../../hooks/useLaunches';
import { usePlan } from '../../hooks/usePlan';
import { useFloatingTooltip } from '../../hooks/useFloatingTooltip';

function RemoveWatchRowButton({ onRemove }: { onRemove: () => void }) {
  const label = 'Remove from watchlist';
  const { ref, onMouseEnter, onMouseLeave, tooltip } = useFloatingTooltip(label);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        aria-label={label}
        className="p-0.5 text-radar-muted/40 hover:text-radar-red transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
      >
        <EyeOff size={11} />
      </button>
      {tooltip}
    </>
  );
}

function GhostWatchlistRow() {
  return (
    <div className="flex items-center gap-2 py-2 px-3">
      <div className="w-2 h-2 rounded-full bg-white/10 flex-shrink-0" />
      <div className="h-3 w-20 bg-white/10 rounded flex-1" />
      <div className="h-3 w-12 bg-white/10 rounded" />
      <div className="h-3 w-8 bg-amber-400/10 rounded" />
    </div>
  );
}

export function WatchlistPanel({ onClose }: { onClose?: () => void }) {
  const openDrawer = useAppStore((s) => s.openDrawer);
  const watchedIds = useWatchlistStore((s) => s.watchedIds);
  const toggleWatch = useWatchlistStore((s) => s.toggleWatch);
  const { data: launches } = useLaunches();
  const { has } = usePlan();

  const isGated = !has('scout');
  const watched = launches?.filter((l) => watchedIds.has(l.id)) ?? [];

  return (
    <PanelShell
      title="WATCHLIST"
      icon={Eye}
      iconColor="text-sky-400"
      onClose={onClose}
      actions={
        <div className="flex items-center gap-1">
          {isGated && <UpgradeButton targetPlan="scout" size="xs" />}
          <WatchlistSettingsPopover />
        </div>
      }
      className="border-cyan-500/25 bg-[linear-gradient(180deg,rgba(5,40,72,0.32)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(0,212,255,0.1)]"
    >
      {/* Ghost rows when gated and empty */}
      {isGated && watched.length === 0 && (
        [0, 1, 2].map(i => (
          <GatedContent key={i} requires="scout" blurAmount={5} opacity={0.45}>
            <GhostWatchlistRow />
          </GatedContent>
        ))
      )}

      {/* Empty state for ungated */}
      {!isGated && watched.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-center px-2 gap-2">
          <EyeOff size={20} className="text-cyan-300/40" />
          <p className="text-[10px] font-mono font-bold tracking-widest text-cyan-300/85">
            NO LAUNCHES WATCHED
          </p>
          <p className="text-[9px] font-mono text-radar-muted/60">
            Click the eye icon on any launch to watch it
          </p>
        </div>
      )}

      {/* Real rows — individually gated if plan insufficient */}
      <AnimatePresence mode="popLayout">
        {watched.map((launch) => {
          const row = (
            <motion.div
              key={launch.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/[0.03] rounded cursor-pointer transition-colors group"
              onClick={() => openDrawer(launch.id)}
            >
              <span className="flex-1 font-mono text-sm truncate min-w-0 text-radar-text">
                {launch.projectName}
              </span>
              <PlatformTag platform={launch.platform} />
              <StatusBadge status={launch.status} />
              <WatchItemSettings launchId={launch.id} />
              <RemoveWatchRowButton onRemove={() => toggleWatch(launch.id)} />
            </motion.div>
          );

          return isGated ? (
            <GatedContent key={launch.id} requires="scout" blurAmount={5} opacity={0.45}>
              {row}
            </GatedContent>
          ) : row;
        })}
      </AnimatePresence>
    </PanelShell>
  );
}
