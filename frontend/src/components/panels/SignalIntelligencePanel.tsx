import { formatDistanceToNow } from 'date-fns';
import { useCallback, useMemo, useState } from 'react';
import { useIntelligence } from '../../hooks/useIntelligence';
import type { IntelligenceStats } from '../../hooks/useIntelligence';
import { PanelShell } from './PanelShell';
import { ChainTag } from '../shared/ChainTag';
import { UpgradeButton } from '../shared/UpgradeButton';
import { useAppStore } from '../../store/app.store';
import type { LaunchRecord, LaunchStatus } from '../../types';

function RadioIcon() {
  return (
    <span className="text-red-400/60 text-[10px] font-mono animate-pulse">
      ((·))
    </span>
  );
}

function StatCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white/[0.02] rounded px-2.5 py-2">
      <p className="text-[9px] font-mono tracking-widest text-white/25 uppercase">
        {label}
      </p>
      <p
        className={`text-xl font-mono mt-0.5 leading-none ${
          highlight ? 'text-cyan-400' : 'text-white/70'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ChainBar({ chain, pct }: { chain: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono text-white/40 w-16 truncate uppercase">
        {chain}
      </span>
      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400/50 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] font-mono text-white/25 w-8 text-right">
        {pct}%
      </span>
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
        <StatCell
          label="LAUNCHED TODAY"
          value={stats.launchedToday}
          highlight={stats.launchedToday > 0}
        />
      </div>

      {stats.chainDistribution.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-mono tracking-widest text-white/25 uppercase">
            Most Active Chain
          </p>
          {stats.chainDistribution.map((c) => (
            <ChainBar key={c.chain} chain={c.chain} pct={c.pct} />
          ))}
        </div>
      )}

      {stats.lastSignal && (
        <p className="text-[10px] font-mono text-white/25 truncate">
          LAST SIGNAL{' '}
          <span className="text-white/50">
            {stats.lastSignal.projectName ?? '???'}
          </span>
          {stats.lastSignal.chain && (
            <span className="text-white/30"> · {stats.lastSignal.chain}</span>
          )}
          <span className="text-white/25">
            {' '}·{' '}
            {formatDistanceToNow(new Date(stats.lastSignal.detectedAt), {
              addSuffix: true,
            })}
          </span>
        </p>
      )}
    </div>
  );
}

function SignalRow({ signal }: { signal: LaunchRecord }) {
  const openDrawer = useAppStore((s) => s.openDrawer);

  const row = (
    <div
      className="flex items-center gap-2 px-4 py-2 min-w-0 overflow-hidden
                 hover:bg-white/[0.02] transition-colors cursor-pointer
                 border-b border-white/[0.03]"
      onClick={signal.redacted ? undefined : () => openDrawer(signal.id)}
    >
      <StatusDot status={signal.status} />

      <span className="text-sm truncate min-w-0 flex-1 text-white/80 font-mono">
        {signal.projectName ?? '???'}
      </span>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {signal.chain && <ChainTag chain={signal.chain} />}
        <span className="font-mono text-[10px] text-white/25 whitespace-nowrap">
          {formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true })}
        </span>
      </div>
    </div>
  );

  return row;
}

const STATUS_DOT_COLORS: Record<LaunchStatus, string> = {
  STUB: '#FF4444',
  PARTIAL: '#F5A623',
  CONFIRMED: '#F5C542',
  VERIFIED: '#00D4FF',
  LIVE: '#00D4FF',
  STALE: '#6B7280',
  CANCELLED: '#FB7185',
};

function StatusDot({ status }: { status: LaunchStatus }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: STATUS_DOT_COLORS[status] }}
    />
  );
}

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
      <span className="text-white/10 text-[10px] font-mono tracking-widest">
        NO RECENT SIGNALS
      </span>
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

export function SignalIntelligencePanel({ onClose }: { onClose?: () => void }) {
  const { data, isLoading } = useIntelligence();

  const { visible, redacted } = useMemo(() => {
    if (!data) return { visible: [], redacted: [] };
    const vis: LaunchRecord[] = [];
    const red: LaunchRecord[] = [];
    for (const s of data.signals) {
      (s.redacted ? red : vis).push(s);
    }
    return { visible: vis, redacted: red };
  }, [data]);

  /** Stop mousedown from reaching react-draggable so text selection works */
  const stopDrag = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <PanelShell
      title="SIGNAL INTELLIGENCE"
      onClose={onClose}
      actions={<RadioIcon />}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className="flex flex-col h-full overflow-hidden -m-3" onMouseDown={stopDrag}>
        {isLoading || !data ? (
          <IntelligenceSkeleton />
        ) : (
          <>
            <StatsBlock stats={data.stats} />

            <div className="h-px bg-white/[0.05] flex-shrink-0 mx-3" />

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
              {data.signals.length === 0 ? (
                <EmptySignalState />
              ) : (
                <>
                  {visible.map((signal) => (
                    <SignalRow key={signal.id} signal={signal} />
                  ))}

                  {redacted.length > 0 && (
                    <div className="relative flex-1 min-h-0">
                      <UpgradeOverlay redactedCount={redacted.length} />
                      <div className="blur-[3px] opacity-40 select-none pointer-events-none h-full overflow-hidden">
                        {redacted.map((signal) => (
                          <SignalRow key={signal.id} signal={signal} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </PanelShell>
  );
}
