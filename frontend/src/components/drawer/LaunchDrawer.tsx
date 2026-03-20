import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAppStore } from '../../store/app.store';
import { useLaunch } from '../../hooks/useLaunch';
import { StatusBadge } from '../shared/StatusBadge';
import { ChainTag } from '../shared/ChainTag';
import { ConfidenceBar } from '../shared/ConfidenceBar';
import { resolveSignalTweetUrl } from '../../tweet-status-url';
import { DrawerTimeline } from './DrawerTimeline';
import { DrawerTweets } from './DrawerTweets';
import { CancelledLaunchBanner } from '../shared/CancelledLaunchBanner';

export function LaunchDrawer() {
  const open = useAppStore((s) => s.drawerOpen);
  const id = useAppStore((s) => s.selectedLaunchId);
  const close = useAppStore((s) => s.closeDrawer);
  const { data: launch } = useLaunch(id);
  const isCancelled = launch?.status === 'CANCELLED';
  const signalTweetUrl =
    launch != null
      ? resolveSignalTweetUrl(launch.sourceTweetUrl, launch.tweets)
      : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <AnimatePresence>
      {open && launch && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={`fixed right-0 top-0 bottom-0 w-[480px] max-w-full z-50 overflow-y-auto border-l ${
              isCancelled
                ? 'border-rose-500/35 bg-[#0c0809] bg-linear-to-b from-rose-950/25 via-radar-bg to-radar-bg'
                : 'border-radar-border bg-radar-bg'
            }`}
          >
            <div className="p-6 border-b border-radar-border">
              <div className="flex items-start justify-between mb-3">
                <h2
                  className={`font-display text-4xl leading-none ${
                    isCancelled ? 'text-radar-text/85' : 'text-radar-text'
                  }`}
                >
                  {launch.projectName}
                </h2>
                <button onClick={close} className="p-1 text-radar-muted hover:text-radar-text transition-colors">
                  <X size={20} />
                </button>
              </div>
              <StatusBadge status={launch.status} />
            </div>

            {isCancelled && <CancelledLaunchBanner />}

            <div
              className={`px-6 py-4 border-b border-radar-border ${
                isCancelled ? 'opacity-[0.72]' : ''
              }`}
            >
              <ConfidenceBar launch={launch} showLabels />
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-3 gap-x-4 gap-y-4 px-6 py-4 border-b border-radar-border">
              <MetaField label="CHAIN" value={<ChainTag chain={launch.chain} />} />
              <MetaField label="CATEGORY" value={launch.category ?? '\u2014'} />
              <MetaField label="LAUNCH TYPE" value={launch.launchType ?? '\u2014'} />
              <MetaField
                label="LAUNCH DATE"
                value={
                  <div className="flex flex-col gap-0.5">
                    <span>
                      {launch.launchDate
                        ? new Date(launch.launchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : launch.launchDateRaw ?? 'TBD'}
                    </span>
                    {launch.rescheduledAt && launch.previousLaunchDate && (
                      <span className="text-[10px] font-mono text-amber-400">
                        was {new Date(launch.previousLaunchDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                }
              />
              <MetaField
                label="DISCOVERED"
                value={formatDistanceToNow(new Date(launch.createdAt), { addSuffix: true })}
              />
              <MetaField
                label="CONFIDENCE"
                value={
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden shrink-0">
                      <div
                        className="h-full rounded-full bg-radar-amber"
                        style={{ width: `${launch.confidenceScore * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs shrink-0">{launch.confidenceScore.toFixed(2)}</span>
                  </div>
                }
              />
              {signalTweetUrl && (
                <MetaField
                  className="col-span-3 min-w-0"
                  label="SIGNAL SOURCE"
                  value={
                    <a
                      href={signalTweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-radar-cyan hover:underline text-xs font-mono break-all inline-block"
                    >
                      {signalTweetUrl}
                    </a>
                  }
                />
              )}
              {launch.website && (
                <MetaField
                  className="col-span-3 min-w-0"
                  label="WEBSITE"
                  value={
                    <a href={launch.website} target="_blank" rel="noopener noreferrer"
                       className="text-radar-cyan hover:underline text-xs break-all inline-block">
                      {launch.website.replace(/^https?:\/\//, '')}
                    </a>
                  }
                />
              )}
              {launch.ticker && (
                <MetaField
                  className="col-span-3 min-w-0"
                  label="TICKER"
                  value={<span className="font-mono text-xs break-all">{'$'}{launch.ticker}</span>}
                />
              )}
              {launch.twitterHandle && (
                <MetaField
                  className="col-span-3 min-w-0"
                  label="TWITTER"
                  value={
                    <span className="text-radar-cyan text-xs break-all">
                      @{launch.twitterHandle}
                      {launch.twitterFollowers != null && (
                        <span className="text-radar-muted ml-1">({launch.twitterFollowers.toLocaleString()})</span>
                      )}
                    </span>
                  }
                />
              )}
            </div>

            {/* Source Tweets */}
            <div className="px-6 py-4 border-b border-radar-border">
              <h3 className="text-xs font-mono font-bold tracking-widest text-radar-muted mb-3">
                SOURCE TWEETS
              </h3>
              <DrawerTweets tweets={launch.tweets} />
            </div>

            {/* Timeline */}
            <div className="px-6 py-4">
              <h3 className="text-xs font-mono font-bold tracking-widest text-radar-muted mb-3">
                TIMELINE
              </h3>
              <DrawerTimeline launch={launch} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function MetaField({
  label,
  value,
  className = '',
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] font-mono tracking-wider text-radar-muted mb-0.5">{label}</p>
      <div className="text-sm text-radar-text min-w-0">{value}</div>
    </div>
  );
}
