import { formatDistanceToNow } from 'date-fns';
import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useIntelligence } from '../../hooks/useIntelligence';
import type { IntelligenceStats } from '../../hooks/useIntelligence';
import { PanelShell } from './PanelShell';
import { SignalCard } from './SignalCard';
import { BatchRow } from './BatchRow';
import { UpgradeButton } from '../shared/UpgradeButton';
import { useAppStore } from '../../store/app.store';
import type { LaunchRecord } from '../../types';

// ── Helpers ────────────────────────────────────────────────

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

const LAUNCH_TYPE_LABELS: Record<string, string> = {
  presale: 'PRE',
  airdrop: 'AIRDROP',
  mainnet: 'MAINNET',
  mint: 'MINT',
  testnet: 'TESTNET',
  tge: 'TGE',
};

// ── Sub-components ─────────────────────────────────────────

function RadioIcon() {
  return (
    <span className="text-red-400/60 text-[10px] font-mono animate-pulse">
      ((·))
    </span>
  );
}

function StatCell({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="bg-white/[0.02] rounded px-2.5 py-2">
      <p className="text-[9px] font-mono tracking-widest text-white/25 uppercase">{label}</p>
      <p className={`text-xl font-mono mt-0.5 leading-none ${highlight ? 'text-cyan-400' : 'text-white/70'}`}>
        {value}
      </p>
    </div>
  );
}

function PlatformBar({ platform, pct }: { platform: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-white/40 w-16 truncate uppercase">{platform}</span>
      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-amber-400/50 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-white/25 w-8 text-right">{pct}%</span>
    </div>
  );
}

function StatsBlock({ stats }: { stats: IntelligenceStats }) {
  return (
    <div className="px-4 py-3 flex-shrink-0 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCell label="SIGNALS TODAY" value={stats.signalsToday} />
        <StatCell label="CONFIRMED" value={stats.cryptoConfirmed} />
        <StatCell label="TRACKING" value={stats.currentlyTracking} />
        <StatCell label="LAUNCHED TODAY" value={stats.launchedToday} highlight={stats.launchedToday > 0} />
      </div>

      {stats.platformDistribution.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-mono tracking-widest text-white/25 uppercase">Most Active Platform</p>
          {stats.platformDistribution.map((c) => (
            <PlatformBar key={c.platform} platform={c.platform} pct={c.pct} />
          ))}
        </div>
      )}

      {stats.lastSignal && (
        <p className="text-[10px] font-mono text-white/25 truncate">
          LAST SIGNAL{' '}
          <span className="text-white/50">{stats.lastSignal.projectName ?? '???'}</span>
          {stats.lastSignal.platform && <span className="text-white/30"> · {stats.lastSignal.platform}</span>}
          <span className="text-white/25">
            {' '}· {formatDistanceToNow(new Date(stats.lastSignal.detectedAt), { addSuffix: true })}
          </span>
        </p>
      )}
    </div>
  );
}

// ── Hover tooltip (shows all the rich detail) ──────────────

function SignalTooltip({ signal, anchor }: { signal: LaunchRecord; anchor: DOMRect }) {
  const summary = signal.summary
    ? signal.summary.length > 140 ? signal.summary.slice(0, 140) + '...' : signal.summary
    : null;

  const launchType = signal.launchType
    ? LAUNCH_TYPE_LABELS[signal.launchType.toLowerCase()] ?? signal.launchType
    : null;

  // Confidence segments
  const segments = [
    { label: 'Name', filled: !!signal.projectName },
    { label: 'Chain', filled: !!signal.platform },
    { label: 'Date', filled: !!signal.launchDate },
    { label: 'Web', filled: !!signal.website },
  ];

  return (
    <div
      className="fixed z-50 w-60 px-3 py-2.5 bg-black/95 border border-white/10 rounded font-mono text-[10px] text-white/50 leading-relaxed space-y-1.5 pointer-events-none"
      style={{
        top: Math.max(8, anchor.top - 4),
        left: Math.max(8, anchor.left - 248),
      }}
    >
      {summary && <p className="text-white/60 leading-snug">{summary}</p>}

      {/* Confidence bar */}
      <div className="flex items-center gap-1">
        <span className="text-white/25 text-[9px]">Score</span>
        <div className="flex items-center gap-0.5">
          {segments.map((s) => (
            <div
              key={s.label}
              className="h-1.5 w-3 rounded-sm"
              style={{ backgroundColor: s.filled ? '#F5C542' : 'rgba(255,255,255,0.08)' }}
              title={s.label}
            />
          ))}
        </div>
        <span className="text-white/30 text-[9px]">{(signal.confidenceScore * 100).toFixed(0)}%</span>
      </div>

      {signal.launchDate && (
        <p>
          <span className="text-white/25">Launch: </span>
          <span className="text-amber-400/80">
            {new Date(signal.launchDate).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </span>
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {launchType && (
          <span className="px-1 py-px rounded bg-white/[0.06] text-white/40 text-[9px]">{launchType}</span>
        )}
        {signal.primaryCategory && (
          <span className="text-white/30 text-[9px]">{signal.primaryCategory}</span>
        )}
      </div>

      {signal.twitterHandle && (
        <p>
          <span className="text-white/25">@</span>
          <span className="text-white/45">{signal.twitterHandle}</span>
          {signal.twitterFollowers != null && signal.twitterFollowers > 0 && (
            <span className="text-white/25"> · {formatFollowers(signal.twitterFollowers)} followers</span>
          )}
        </p>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────

/** Max individual cards shown in the scrollable area; the rest collapse into BatchRow */
const VISIBLE_LIMIT = 8;

// ── Other sub-components ──────────────────────────────────

function InfoTooltip() {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex items-center ml-2 cursor-help"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="text-amber-400/70 text-[9px] font-bold font-mono leading-none border border-amber-400/40 rounded-full w-4 h-4 inline-flex items-center justify-center hover:text-amber-400 hover:border-amber-400/60 transition-colors">
        i
      </span>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 px-3 py-2.5 bg-black/95 border border-white/10 rounded text-[10px] font-mono text-white/50 leading-relaxed z-20 space-y-1.5">
          <p><span className="text-cyan-400/80">VERIFIED</span> = public. By then, everyone&apos;s seen it.</p>
          <p><span className="text-amber-400/80">Scout</span> gets signals hours earlier — time to DYOR before the crowd.</p>
        </div>
      )}
    </span>
  );
}

function UpgradeOverlay({ redactedCount }: { redactedCount: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/60 backdrop-blur-[1px]">
      <div className="flex items-center">
        <p className="text-[11px] font-mono text-white/60 tracking-wide">
          +{redactedCount} early signal{redactedCount !== 1 ? 's' : ''}
        </p>
        <InfoTooltip />
      </div>
      <UpgradeButton targetPlan="scout" size="sm" />
    </div>
  );
}

function EmptySignalState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <span className="text-white/10 text-[10px] font-mono tracking-widest">NO RECENT SIGNALS</span>
    </div>
  );
}

function IntelligenceSkeleton() {
  return (
    <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
      SCANNING...
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────

export function SignalFeedPanel({ onClose }: { onClose?: () => void }) {
  const { data, isLoading } = useIntelligence();

  // 10s re-render tick — drives the freshness glow fade on cards
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = setInterval(forceUpdate, 10_000);
    return () => clearInterval(id);
  }, []);

  // Hover tooltip
  const [hoveredSignal, setHoveredSignal] = useState<LaunchRecord | null>(null);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHover = useCallback((signal: LaunchRecord, rect: DOMRect) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredSignal(signal);
      setHoverRect(rect);
    }, 300);
  }, []);

  const handleLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoveredSignal(null);
    setHoverRect(null);
  }, []);

  const { visible, redacted } = useMemo(() => {
    if (!data) return { visible: [], redacted: [] };
    const vis: LaunchRecord[] = [];
    const red: LaunchRecord[] = [];
    for (const s of data.signals) {
      // Filter out LIVE records older than 24h — stale intelligence
      if (s.status === 'LIVE') {
        const launchedAt = s.launchedAt ? new Date(s.launchedAt) : new Date(s.createdAt);
        if (Date.now() - launchedAt.getTime() >= 24 * 60 * 60 * 1000) continue;
      }
      (s.redacted ? red : vis).push(s);
    }
    return { visible: vis, redacted: red };
  }, [data]);

  const topSignals = visible.slice(0, VISIBLE_LIMIT);
  const remainingSignals = visible.slice(VISIBLE_LIMIT);

  const stopDrag = useCallback((e: React.MouseEvent) => { e.stopPropagation(); }, []);

  return (
    <PanelShell
      title="SIGNAL FEED"
      onClose={onClose}
      actions={<RadioIcon />}
      contentClassName="flex-1 overflow-y-auto min-h-0 radar-scrollbar"
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div onMouseDown={stopDrag}>
        {isLoading || !data ? (
          <IntelligenceSkeleton />
        ) : (
          <>
            {/* Stats — sticky at top so cards scroll behind it */}
            <div className="sticky top-0 z-10 bg-radar-bg">
              <StatsBlock stats={data.stats} />
              <div className="h-px bg-white/[0.05] mx-3" />
            </div>

            {topSignals.length === 0 && redacted.length === 0 ? (
              <EmptySignalState />
            ) : (
              <div className="py-1">
                <AnimatePresence initial={false}>
                  {topSignals.map((s) => (
                    <SignalCard
                      key={s.id}
                      signal={s}
                      isNew={Date.now() - new Date(s.createdAt).getTime() < 60_000}
                      onHover={(rect) => handleHover(s, rect)}
                      onLeave={handleLeave}
                    />
                  ))}
                </AnimatePresence>

                {redacted.length > 0 && (
                  <div className="relative">
                    <UpgradeOverlay redactedCount={redacted.length} />
                    <div className="blur-[3px] opacity-40 select-none pointer-events-none overflow-hidden">
                      {redacted.map((signal) => (
                        <SignalCard key={signal.id} signal={signal} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Batch row — sticky at bottom */}
            {remainingSignals.length > 0 && (
              <div
                className="sticky bottom-0 z-10 bg-radar-bg"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
              >
                <BatchRow
                  count={remainingSignals.length}
                  signals={remainingSignals}
                  onHover={handleHover}
                  onLeave={handleLeave}
                />
              </div>
            )}
          </>
        )}
      </div>

      {hoveredSignal && hoverRect && (
        <SignalTooltip signal={hoveredSignal} anchor={hoverRect} />
      )}
    </PanelShell>
  );
}
