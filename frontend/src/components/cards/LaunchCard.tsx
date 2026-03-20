import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ChainTag } from '../shared/ChainTag';
import { StatusBadge } from '../shared/StatusBadge';
import { ConfidenceBar } from '../shared/ConfidenceBar';
import { useAppStore } from '../../store/app.store';
import type { LaunchRecord } from '../../types';

function formatLaunchTime(
  date: string | null,
  raw: string | null,
  status: LaunchRecord['status'],
  launchedAt: string | null
): string {
  if (status === 'LIVE' && launchedAt) {
    return `launched ${formatDistanceToNow(new Date(launchedAt))} ago`;
  }
  if (!date && raw) return raw;
  if (!date) return 'TBD';
  const d = new Date(date);
  const now = new Date();
  const diffH = (d.getTime() - now.getTime()) / 3_600_000;
  if (diffH < 0) return 'LAUNCHED';
  if (diffH < 1) return `in ${Math.round(diffH * 60)}m`;
  if (diffH < 24) return `in ${Math.round(diffH)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function LaunchCard({ launch }: { launch: LaunchRecord }) {
  const openDrawer = useAppStore((s) => s.openDrawer);

  return (
    <motion.div
      layout
      data-launch-card={launch.id}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={() => openDrawer(launch.id)}
      className={`p-3 rounded-lg border bg-radar-panel cursor-pointer transition-colors group ${
        launch.status === 'LIVE'
          ? 'border-cyan-500/30 hover:border-cyan-400/50 border-l-2 border-l-[#00D4FF]'
          : 'border-radar-border hover:border-radar-amber/20'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-display text-xl leading-none text-radar-text group-hover:text-radar-amber transition-colors">
          {launch.projectName}
        </h3>
        <StatusBadge status={launch.status} />
      </div>

      <div className="flex items-center gap-2 mb-2">
        <ChainTag chain={launch.chain} />
        {launch.category && (
          <span className="px-2 py-0.5 rounded text-xs font-mono text-radar-muted bg-white/5">
            {launch.category}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className={`font-mono text-sm ${launch.status === 'LIVE' ? 'text-cyan-400' : 'text-radar-amber'}`}>
          {formatLaunchTime(launch.launchDate, launch.launchDateRaw, launch.status, launch.launchedAt)}
        </span>
        {launch.status === 'LIVE' ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-400 text-xs font-mono font-bold tracking-widest">
              LIVE
            </span>
          </div>
        ) : (
          <ConfidenceBar launch={launch} />
        )}
      </div>

      <p className="text-[10px] font-mono text-radar-muted mt-2">
        discovered {formatDistanceToNow(new Date(launch.createdAt), { addSuffix: true })}
      </p>
    </motion.div>
  );
}
