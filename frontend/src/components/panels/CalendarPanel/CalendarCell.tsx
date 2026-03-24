import { useState, useRef, useCallback } from 'react';
import type { LaunchRecord, LaunchStatus } from '../../../types';
import { CalendarDayPopover } from './CalendarDayPopover';

const CHAIN_SYMBOLS: Record<string, { label: string; color: string }> = {
  solana:   { label: 'S', color: '#9945FF' },
  ethereum: { label: 'E', color: '#627EEA' },
  base:     { label: 'B', color: '#0052FF' },
  bsc:      { label: 'B', color: '#F3BA2F' },
  pump:     { label: 'P', color: '#00D4FF' },
};

function ChainDot({ chain, redacted }: { chain: string | null; redacted?: boolean }) {
  const key = (chain ?? '').toLowerCase();
  const sym = CHAIN_SYMBOLS[key];

  if (redacted) {
    return (
      <span className="w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0 bg-white/10 text-white/20 text-[7px] font-mono font-bold">
        ?
      </span>
    );
  }

  if (!sym) {
    return (
      <span className="w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0 bg-white/10 text-white/30 text-[7px] font-mono font-bold">
        ?
      </span>
    );
  }

  return (
    <span
      className="w-3.5 h-3.5 rounded-sm flex items-center justify-center flex-shrink-0 text-[7px] font-mono font-bold"
      style={{ backgroundColor: `${sym.color}22`, color: sym.color }}
    >
      {sym.label}
    </span>
  );
}

const DOT_COLORS: Record<LaunchStatus, string> = {
  STUB: 'bg-red-500',
  PARTIAL: 'bg-orange-400',
  CONFIRMED: 'bg-amber-400',
  VERIFIED: 'bg-cyan-400',
  LIVE: 'bg-cyan-400 animate-pulse',
  STALE: 'bg-white/20',
  CANCELLED: 'bg-white/20',
};

export function CalendarCell({
  date,
  dateStr,
  isCurrentMonth,
  isToday,
  isExpanded,
  launches,
  viewMode,
  onClick,
}: {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isExpanded: boolean;
  launches: LaunchRecord[];
  viewMode: 'week' | 'month';
  onClick: () => void;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    if (viewMode !== 'month' || launches.length === 0) return;
    hoverTimer.current = setTimeout(() => setShowPopover(true), 300);
  }, [viewMode, launches.length]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setShowPopover(false);
  }, []);

  const intensity = Math.min(launches.length / 8, 1);
  const bgOpacity = launches.length > 0 ? 0.04 + intensity * 0.08 : 0;

  const popoverPosition = (() => {
    if (!cellRef.current) return 'below' as const;
    const rect = cellRef.current.getBoundingClientRect();
    return rect.top > window.innerHeight / 2 ? 'above' as const : 'below' as const;
  })();

  return (
    <div
      ref={cellRef}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`
        relative bg-[#0A0A0F] cursor-pointer transition-all
        ${viewMode === 'week' ? 'h-40' : 'h-16'}
        ${!isCurrentMonth ? 'opacity-25' : ''}
        ${isToday ? 'ring-1 ring-amber-400/50 bg-amber-400/[0.03]' : ''}
        ${isExpanded ? 'ring-1 ring-white/20 bg-white/[0.04]' : ''}
        hover:bg-white/[0.06]
      `}
      style={bgOpacity > 0 && !isToday && !isExpanded ? { backgroundColor: `rgba(251, 191, 36, ${bgOpacity})` } : undefined}
    >
      <div className="p-1.5 h-full flex flex-col">
        <span className={`text-[10px] font-mono leading-none ${
          isToday ? 'text-amber-400 font-bold' : 'text-white/30'
        }`}>
          {viewMode === 'week' ? `${['SUN','MON','TUE','WED','THU','FRI','SAT'][date.getDay()]} ${date.getDate()}` : date.getDate()}
        </span>

        {viewMode === 'month' && (
          <div className="flex flex-wrap gap-0.5 mt-1 items-start">
            {launches.length === 0 && isCurrentMonth && (
              <span className="text-white/10 text-xs w-full text-center mt-1">·</span>
            )}
            {launches.slice(0, launches.length > 5 ? 4 : 5).map((l) => (
              <ChainDot key={l.id} chain={l.chain} redacted={l.redacted} />
            ))}
            {launches.length > 5 && (
              <span className="text-white/40 text-[8px] font-mono leading-none self-center">
                +{launches.length - 4}
              </span>
            )}
          </div>
        )}

        {viewMode === 'week' && (
          <div className="flex flex-col gap-1 mt-2 overflow-hidden flex-1">
            {launches.slice(0, 4).map((l) => (
              <div key={l.id} className="flex items-center gap-1.5 min-w-0">
                <ChainDot chain={l.chain} redacted={l.redacted} />
                <span className={`text-[10px] font-mono truncate ${
                  l.redacted ? 'text-white/20 blur-[2px] select-none' : 'text-white/70'
                }`}>
                  {l.projectName}
                </span>
              </div>
            ))}
            {launches.length > 4 && (
              <span className="text-white/30 text-[10px] font-mono">
                +{launches.length - 4} more
              </span>
            )}
            {launches.length === 0 && isCurrentMonth && (
              <span className="text-white/10 text-xs text-center mt-4">·</span>
            )}
          </div>
        )}
      </div>

      {showPopover && !isExpanded && (
        <CalendarDayPopover
          date={date}
          launches={launches}
          position={popoverPosition}
        />
      )}
    </div>
  );
}
