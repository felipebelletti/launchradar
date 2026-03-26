import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChainTag } from '../shared/ChainTag';
import { SignalCard } from './SignalCard';
import type { LaunchRecord } from '../../types';

interface BatchRowProps {
  count: number;
  signals: LaunchRecord[];
  onHover?: (signal: LaunchRecord, rect: DOMRect) => void;
  onLeave?: () => void;
}

export function BatchRow({ count, signals, onHover, onLeave }: BatchRowProps) {
  const [expanded, setExpanded] = useState(false);
  const chains = [...new Set(signals.map((s) => s.chain).filter(Boolean))];

  return (
    <div>
      {/* Expanded cards — renders above the button, pushes upward */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="overflow-y-auto py-1 radar-scrollbar" style={{ maxHeight: '40vh' }}>
              {signals.map((s) => (
                <SignalCard
                  key={s.id}
                  signal={s}
                  onHover={onHover ? (rect) => onHover(s, rect) : undefined}
                  onLeave={onLeave}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button — always pinned at the very bottom */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.03] transition text-left"
      >
        <span className="text-white/25 text-[10px] font-mono">
          {expanded ? '\u25BE' : '\u25B8'}
        </span>
        <span className="text-white/50 text-[11px] font-mono">
          +{count} older signal{count !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-1 mx-1">
          {chains.slice(0, 3).map((c) => (
            <ChainTag key={c} chain={c!} />
          ))}
        </div>
      </button>
    </div>
  );
}
