import { motion } from 'framer-motion';
import { ChainTag } from '../shared/ChainTag';
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
      className={`flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03] cursor-pointer
                 transition-colors rounded ${isNewHighlight ? 'launch-new-highlight bg-radar-amber/[0.07]' : ''} ${
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
      <span style={{ color: STATUS_COLORS[launch.status] }}>{STATUS_ICONS[launch.status]}</span>
      <span className="flex-1 font-mono text-sm truncate text-radar-text">
        {launch.projectName}
      </span>
      <ChainTag chain={launch.chain} />
      {launch.category && (
        <span className="text-xs text-radar-muted font-mono hidden sm:inline">{launch.category}</span>
      )}
      <span className="text-xs font-mono text-radar-muted w-14 text-right">
        {formatShortTime(launch.launchDate)}
      </span>
      <span className="text-xs font-mono font-bold w-20 text-right" style={{ color: STATUS_COLORS[launch.status] }}>
        {launch.status === 'STUB' ? 'SIGNAL' : launch.status}
      </span>
    </motion.div>
  );
}
