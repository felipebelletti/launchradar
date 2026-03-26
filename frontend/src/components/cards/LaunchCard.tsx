import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { PlatformTag } from '../shared/PlatformTag';
import { CategoryBadge } from '../shared/CategoryBadge';
import { useAppStore } from '../../store/app.store';
import { WatchButton } from '../shared/WatchButton';
import { DiscardButton } from '../shared/DiscardButton';
import type { LaunchRecord } from '../../types';

function formatLaunchTime(
  date: string | null,
  raw: string | null,
  status: LaunchRecord['status'],
  launchedAt: string | null,
  hasLiveNowTweet?: boolean
): string {
  if (status === 'LIVE' && launchedAt) {
    return `launched ${formatDistanceToNow(new Date(launchedAt), { addSuffix: true })}`;
  }
  if (hasLiveNowTweet) return 'live now';
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

const HEADER_STYLE: Record<string, {
  bg: string; borderB: string; border: string;
  dotColor: string; textColor: string; label: string; pulse: boolean;
}> = {
  LIVE:      { bg: 'bg-cyan-400/[0.08]',   borderB: 'border-b border-cyan-400/10',   border: 'border-cyan-400/20',   dotColor: 'bg-cyan-400',   textColor: 'text-cyan-400',   label: 'LIVE',      pulse: true },
  VERIFIED:  { bg: 'bg-cyan-400/[0.08]',   borderB: 'border-b border-cyan-400/10',   border: 'border-cyan-400/20',   dotColor: 'bg-cyan-400',   textColor: 'text-cyan-400',   label: 'VERIFIED',  pulse: false },
  CONFIRMED: { bg: 'bg-amber-400/[0.07]',  borderB: 'border-b border-amber-400/10',  border: 'border-amber-400/15',  dotColor: 'bg-amber-400',  textColor: 'text-amber-400',  label: 'CONFIRMED', pulse: false },
  PARTIAL:   { bg: 'bg-orange-400/[0.06]', borderB: 'border-b border-orange-400/10', border: 'border-orange-400/15', dotColor: 'bg-orange-400', textColor: 'text-orange-400', label: 'PARTIAL',   pulse: false },
  STUB:      { bg: 'bg-red-400/[0.06]',    borderB: 'border-b border-red-400/10',    border: 'border-red-400/15',    dotColor: 'bg-red-400',    textColor: 'text-red-400',    label: 'SIGNAL',    pulse: true },
  STALE:     { bg: 'bg-zinc-400/[0.05]',   borderB: 'border-b border-zinc-400/10',   border: 'border-zinc-400/15',   dotColor: 'bg-zinc-400',   textColor: 'text-zinc-400',   label: 'STALE',     pulse: false },
  CANCELLED: { bg: 'bg-rose-400/[0.06]',   borderB: 'border-b border-rose-400/10',   border: 'border-rose-500/20',   dotColor: 'bg-rose-400',   textColor: 'text-rose-400',   label: 'CANCELLED', pulse: false },
};

export function LaunchCard({ launch }: { launch: LaunchRecord }) {
  const openDrawer = useAppStore((s) => s.openDrawer);
  const isNewHighlight = useAppStore((s) => s.highlightedLaunchIds.includes(launch.id));

  const hasLiveNowTweet = launch.tweets?.some(t => t.timeBadge === 'LIVE_NOW') ?? false;
  const timeLabel = formatLaunchTime(launch.launchDate, launch.launchDateRaw, launch.status, launch.launchedAt, hasLiveNowTweet);

  const style = HEADER_STYLE[launch.status] ?? HEADER_STYLE.STUB;

  return (
    <motion.div
      layout
      data-launch-card={launch.id}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={() => openDrawer(launch.id)}
      className={`group relative rounded-lg border ${style.border} cursor-pointer select-none overflow-hidden transition-colors duration-150 bg-white/[0.02] hover:bg-white/[0.04] ${
        isNewHighlight ? 'launch-new-highlight' : ''
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2 ${style.bg} ${style.borderB}`}>
        <h3 className="font-display text-sm font-bold tracking-wider text-white/90 truncate flex-1 min-w-0">
          {launch.projectName}
        </h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
            <DiscardButton launchId={launch.id} size={12} />
            <WatchButton launchId={launch.id} size={12} />
          </div>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dotColor} ${style.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-[9px] font-mono font-bold tracking-widest flex-shrink-0 ${style.textColor}`}>
            {style.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-[11px] py-2">
        {(launch.platform || launch.primaryCategory) && (
          <div className="flex items-center gap-1.5 min-w-0">
            {launch.platform && <PlatformTag platform={launch.platform} />}
            {launch.primaryCategory && <CategoryBadge category={launch.primaryCategory} />}
          </div>
        )}

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

        {launch.rescheduledAt && (
          <div className="mt-1">
            <RescheduledTag />
          </div>
        )}

        <p className="text-[11px] text-white/30 font-mono mt-1.5 truncate">
          discovered {formatDistanceToNow(new Date(launch.createdAt), { addSuffix: true })}
        </p>
      </div>
    </motion.div>
  );
}
