import { motion } from 'framer-motion';
import { PlatformTag } from '../shared/PlatformTag';
import { StatusBadge } from '../shared/StatusBadge';
import { WatchButton } from '../shared/WatchButton';
import { DiscardButton } from '../shared/DiscardButton';
import { useAppStore } from '../../store/app.store';
import type { LaunchRecord, LaunchStatus } from '../../types';

const STATUS_ICONS: Record<LaunchStatus, string> = {
  STUB: '\u25C9',
  PARTIAL: '\u25CE',
  CONFIRMED: '\u25CF',
  VERIFIED: '\u2726',
  LIVE: '\u25B6',
  STALE: '\u25CB',
  CANCELLED: '\u2715',
};

const STATUS_COLORS: Record<LaunchStatus, string> = {
  STUB: '#FF4444',
  PARTIAL: '#F5A623',
  CONFIRMED: '#F5C542',
  VERIFIED: '#00D4FF',
  LIVE: '#22C55E',
  STALE: '#6B7280',
  CANCELLED: '#FB7185',
};

function formatShortTime(date: string | null): string {
  if (!date) return 'TBD';
  const d = new Date(date);
  const now = new Date();
  const diffH = (d.getTime() - now.getTime()) / 3_600_000;
  if (diffH < 0) return 'LIVE';
  if (diffH < 24) return `in ${Math.round(diffH)}h`;
  if (diffH < 168) return `in ${Math.round(diffH / 24)}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function LaunchRow({ launch, locked = false }: { launch: LaunchRecord; locked?: boolean }) {
  const openDrawer = useAppStore((s) => s.openDrawer);
  const isNewHighlight = useAppStore((s) => s.highlightedLaunchIds.includes(launch.id));

  if (locked) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 text-radar-muted/40 font-mono text-sm">
        <span>{'\u25C9'}</span>
        <span className="flex-1">{'\u2014 \u2014 \u2014'}</span>
        <span className="text-xs">{'\uD83D\uDD12'}</span>
      </div>
    );
  }

  return (
    <motion.div
      data-launch-card={launch.id}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => openDrawer(launch.id)}
      className={`flex items-center gap-2 py-1.5 px-3 min-w-0 overflow-hidden
                 hover:bg-white/[0.02] transition-colors cursor-pointer rounded ${
        isNewHighlight ? 'launch-new-highlight bg-radar-amber/[0.07]' : ''
      } ${
        launch.status === 'CANCELLED' ? 'bg-rose-950/20 hover:bg-rose-950/30' : ''
      }`}
      style={{
        borderLeft: isNewHighlight
          ? '2px solid rgba(245, 197, 66, 0.65)'
          : launch.status === 'CANCELLED'
            ? '2px solid rgba(244, 63, 94, 0.45)'
            : launch.status === 'VERIFIED'
              ? '2px solid #00D4FF33'
              : '2px solid transparent',
        opacity: launch.status === 'STUB' ? 0.5 : 1,
      }}
    >
      {/* Status dot */}
      <span className="flex-shrink-0" style={{ color: STATUS_COLORS[launch.status] }}>
        {STATUS_ICONS[launch.status]}
      </span>

      {/* Project name — truncate, never wrap */}
      <span className="font-display text-sm truncate min-w-0 flex-1 text-radar-text">
        {launch.projectName ?? '???'}
      </span>

      {/* Right side — all flex-shrink-0, never squeezed */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        <DiscardButton launchId={launch.id} size={12} />
        <WatchButton launchId={launch.id} size={12} />
        <PlatformTag platform={launch.platform} />
        <span className="font-mono text-xs text-white/40 whitespace-nowrap w-14 text-right">
          {launch.status === 'LIVE' ? 'LIVE' : formatShortTime(launch.launchDate)}
        </span>
        <StatusBadge status={launch.status} />
      </div>
    </motion.div>
  );
}
