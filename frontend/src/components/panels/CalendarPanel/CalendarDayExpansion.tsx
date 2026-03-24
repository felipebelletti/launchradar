import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { LaunchCard } from '../../cards/LaunchCard';
import { UpgradeButton } from '../../shared/UpgradeButton';
import type { LaunchRecord } from '../../../types';

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

export function CalendarDayExpansion({
  date,
  launches,
  onClose,
}: {
  date: Date;
  launches: LaunchRecord[];
  onClose: () => void;
}) {
  const dayName = DAY_NAMES[date.getDay()];
  const monthName = MONTH_NAMES[date.getMonth()];
  const dayNum = date.getDate();

  const { visible, redacted } = useMemo(() => {
    const vis: LaunchRecord[] = [];
    const red: LaunchRecord[] = [];
    for (const l of launches) {
      (l.redacted ? red : vis).push(l);
    }
    return { visible: vis, redacted: red };
  }, [launches]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="col-span-7 overflow-hidden"
    >
      <div className="border border-radar-border rounded-lg bg-[#12121a] my-1 mx-0.5">
        <div className="flex items-center justify-between px-3 py-2 border-b border-radar-border">
          <span className="font-mono text-[10px] tracking-widest text-white/60">
            {dayName} {monthName} {dayNum} · {launches.length} launch{launches.length !== 1 ? 'es' : ''}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 text-radar-muted hover:text-radar-red transition-colors"
          >
            <X size={12} />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto p-3">
          {visible.map((l) => (
            <div key={l.id} className="min-w-[200px] max-w-[260px] flex-shrink-0">
              <LaunchCard launch={l} />
            </div>
          ))}

          {redacted.length > 0 && (
            <div className="relative min-w-[220px] flex-shrink-0 flex items-center">
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/60 backdrop-blur-[1px] rounded-lg gap-2">
                <p className="text-[10px] font-mono text-white/60">
                  +{redacted.length} early signal{redacted.length !== 1 ? 's' : ''}
                </p>
                <UpgradeButton targetPlan="scout" size="xs" />
              </div>
              <div className="flex gap-3 blur-[3px] opacity-30 select-none pointer-events-none">
                {redacted.slice(0, 2).map((l) => (
                  <div key={l.id} className="min-w-[200px] max-w-[260px] flex-shrink-0">
                    <LaunchCard launch={l} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {launches.length === 0 && (
            <p className="text-[10px] font-mono text-radar-muted/50 text-center py-4 w-full">
              NO SIGNALS
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
