import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ChainTag } from '../shared/ChainTag';
import { StatusBadge } from '../shared/StatusBadge';
import { CategoryBadge } from '../shared/CategoryBadge';
import { useAppStore } from '../../store/app.store';
import type { LaunchRecord } from '../../types';

function formatLaunchTime(
  date: string | null,
  raw: string | null,
  status: LaunchRecord['status'],
  launchedAt: string | null
): string {
  if (status === 'LIVE' && launchedAt) {
    return `launched ${formatDistanceToNow(new Date(launchedAt), { addSuffix: true })}`;
  }
  if (!date && raw) return /^\s*soon\s*$/i.test(raw) ? 'TBD' : raw;
  if (!date) return 'TBD';
  const d = new Date(date);
  const now = new Date();
  const diffH = (d.getTime() - now.getTime()) / 3_600_000;
  if (diffH < 0) return 'LAUNCHED';
  if (diffH < 1) return `in ${Math.round(diffH * 60)}m`;
  if (diffH < 24) return `in ${Math.round(diffH)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function RescheduledTag() {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider whitespace-nowrap flex-shrink-0"
      style={{ color: '#F59E0B', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}
    >
      RESCHEDULED
    </span>
  );
}

export function LaunchCard({ launch }: { launch: LaunchRecord }) {
  const openDrawer = useAppStore((s) => s.openDrawer);
  const isNewHighlight = useAppStore((s) => s.highlightedLaunchIds.includes(launch.id));

  const timeLabel = formatLaunchTime(launch.launchDate, launch.launchDateRaw, launch.status, launch.launchedAt);

  return (
    <motion.div
      layout
      data-launch-card={launch.id}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={() => openDrawer(launch.id)}
      className={`rounded-lg border p-3 cursor-pointer select-none overflow-hidden transition-colors duration-150 ${
        isNewHighlight ? 'launch-new-highlight ' : ''
      }${
        launch.status === 'CANCELLED'
          ? 'border-rose-500/25 hover:border-rose-400/30 bg-rose-950/[0.12]'
          : launch.status === 'LIVE'
            ? 'border-cyan-400/30 hover:bg-cyan-400/[0.06] bg-cyan-400/[0.03]'
            : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      {/* Row 1: Name + Status Badge */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <h3
          className={`font-display text-base leading-tight line-clamp-2 min-w-0 flex-1 transition-colors ${
            launch.status === 'CANCELLED'
              ? 'text-radar-text/80'
              : launch.status === 'LIVE'
                ? 'text-cyan-100'
                : 'text-white'
          }`}
        >
          {launch.projectName}
        </h3>
        <div className="flex-shrink-0 mt-0.5">
          <StatusBadge status={launch.status} />
        </div>
      </div>

      {/* Row 2: Chain + Category tags (same row) */}
      {(launch.chain || launch.primaryCategory) && (
        <div className="flex items-center gap-1.5 mt-2 min-w-0">
          {launch.chain && <ChainTag chain={launch.chain} />}
          {launch.primaryCategory && <CategoryBadge category={launch.primaryCategory} />}
        </div>
      )}

      {/* Row 4: Time label (own line) */}
      <p
        className={`font-mono text-xs mt-2 truncate ${
          launch.status === 'CANCELLED'
            ? 'text-rose-300/80 line-through decoration-rose-500/50'
            : launch.status === 'LIVE'
              ? 'text-cyan-400'
              : 'text-amber-400'
        }`}
      >
        {timeLabel}
      </p>

      {/* Row 5: Rescheduled badge */}
      {launch.rescheduledAt && (
        <div className="mt-1">
          <RescheduledTag />
        </div>
      )}

      {/* Row 6: Discovery timestamp */}
      <p className="text-[11px] text-white/30 font-mono mt-1.5 truncate">
        discovered {formatDistanceToNow(new Date(launch.createdAt), { addSuffix: true })}
      </p>
    </motion.div>
  );
}
