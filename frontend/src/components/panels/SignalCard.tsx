import { useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { formatDistanceToNow, format } from 'date-fns';
import { ChainTag } from '../shared/ChainTag';
import { useAppStore } from '../../store/app.store';
import { WatchButton } from '../shared/WatchButton';
import type { LaunchRecord } from '../../types';

// Vivid but not garish — match chain tag colors at higher opacity for the accent bar
export const CHAIN_ACCENT_COLORS: Record<string, string> = {
  solana:   'rgba(153, 69, 255, 0.6)',
  ethereum: 'rgba(98, 126, 234, 0.6)',
  base:     'rgba(0, 82, 255, 0.6)',
  bsc:      'rgba(243, 186, 47, 0.6)',
  pump:     'rgba(0, 212, 255, 0.5)',
};

function getTimeLabel(signal: LaunchRecord): string {
  if (signal.status === 'LIVE') return 'LIVE';

  if (signal.launchDate) {
    const launchDate = new Date(signal.launchDate);
    const now = new Date();
    const diffH = (launchDate.getTime() - now.getTime()) / 3600000;

    if (diffH < 0) return 'launched';
    if (diffH < 1) return `in ${Math.round(diffH * 60)}m`;
    if (diffH < 24) return `in ${Math.round(diffH)}h`;
    if (diffH < 48) return 'tomorrow';
    return format(launchDate, 'MMM d');
  }

  return formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true });
}

interface SignalCardProps {
  signal: LaunchRecord;
  isNew?: boolean;
  onHover?: (rect: DOMRect) => void;
  onLeave?: () => void;
}

export function SignalCard({ signal, isNew = false, onHover, onLeave }: SignalCardProps) {
  const openDrawer = useAppStore((s) => s.openDrawer);
  const cardRef = useRef<HTMLDivElement>(null);

  const secondsOld = Math.floor(
    (Date.now() - new Date(signal.createdAt).getTime()) / 1000
  );
  const freshness = Math.max(0, 1 - secondsOld / 60);
  const isLive = signal.status === 'LIVE';

  const primaryChain = signal.chain?.split(',')[0].trim().toLowerCase() ?? '';
  const chainColor = CHAIN_ACCENT_COLORS[primaryChain] ?? 'rgba(255,255,255,0.12)';

  const handleMouseEnter = useCallback(() => {
    if (onHover && cardRef.current) onHover(cardRef.current.getBoundingClientRect());
  }, [onHover]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: -16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={signal.redacted ? undefined : () => openDrawer(signal.id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
      className={`group relative flex items-stretch gap-0 mx-2 my-1 rounded-lg overflow-hidden cursor-pointer transition-colors duration-150 hover:bg-white/[0.04] ${isLive ? 'bg-cyan-400/[0.03]' : ''}`}
      style={{
        boxShadow: freshness > 0
          ? `0 0 ${12 * freshness}px rgba(245,197,66,${0.12 * freshness})`
          : undefined,
      }}
    >
      {/* Chain accent bar */}
      <div
        className="flex-shrink-0 w-1 rounded-l-lg"
        style={{ background: chainColor, minHeight: '100%' }}
      />

      {/* Card content */}
      <div className="flex-1 px-3 py-2.5 min-w-0">
        {/* Row 1: name + watch + time label */}
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <span
            className={`font-display text-sm font-medium truncate min-w-0 flex-1 ${
              isLive ? 'text-cyan-100' : 'text-white/90'
            } ${signal.redacted ? 'blur-[3px] select-none' : ''}`}
          >
            {signal.projectName ?? '???'}
          </span>

          <span className="flex items-center gap-1 flex-shrink-0">
            {!signal.redacted && (
              <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                <WatchButton launchId={signal.id} size={12} />
              </span>
            )}
            <span
              className={`font-mono text-[10px] whitespace-nowrap ${
                isLive ? 'text-cyan-400' : 'text-white/40'
              }`}
            >
              {getTimeLabel(signal)}
            </span>
          </span>
        </div>

        {/* Row 2: secondary info */}
        <div className="flex items-center gap-1.5 mt-0.5">
          {isLive ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />
              <span className="text-[10px] font-mono text-cyan-400/60">
                launched{' '}
                {formatDistanceToNow(
                  new Date(signal.launchedAt ?? signal.createdAt),
                  { addSuffix: true },
                )}
              </span>
            </>
          ) : (
            <span className="text-[10px] font-mono text-white/25">
              detected {formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true })}
            </span>
          )}

          {signal.chain && (
            <span className="ml-auto flex items-center gap-1 flex-shrink-0">
              {signal.chain
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean)
                .slice(0, 2)
                .map((c) => (
                  <ChainTag key={c} chain={c} />
                ))}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
