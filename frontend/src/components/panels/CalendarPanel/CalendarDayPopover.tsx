import type { LaunchRecord, LaunchStatus } from '../../../types';
import { PlatformTag } from '../../shared/PlatformTag';

const DOT_COLORS: Record<LaunchStatus, string> = {
  STUB: 'bg-red-500',
  PARTIAL: 'bg-orange-400',
  CONFIRMED: 'bg-amber-400',
  VERIFIED: 'bg-cyan-400',
  LIVE: 'bg-cyan-400',
  STALE: 'bg-white/20',
  CANCELLED: 'bg-white/20',
};

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

export function CalendarDayPopover({
  date,
  launches,
  position,
}: {
  date: Date;
  launches: LaunchRecord[];
  position: 'above' | 'below';
}) {
  const dayName = DAY_NAMES[date.getDay()];
  const monthName = MONTH_NAMES[date.getMonth()];
  const dayNum = date.getDate();

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-50 w-56 rounded-lg border border-radar-border bg-[#14141f] shadow-2xl pointer-events-none font-mono text-xs ${
        position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      <div className="px-3 py-2 border-b border-radar-border flex items-center justify-between">
        <span className="text-white/60 text-[10px] tracking-widest">
          {dayName} {monthName} {dayNum}
        </span>
        <span className="text-white/40 text-[10px]">
          {launches.length} launch{launches.length !== 1 ? 'es' : ''}
        </span>
      </div>
      <div className="p-2 flex flex-col gap-1.5">
        {launches.slice(0, 6).map((l) => (
          <div key={l.id} className={`flex items-center gap-2 ${l.redacted ? 'opacity-40' : ''}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[l.status]}`} />
            <span className={`truncate flex-1 text-[10px] ${
              l.redacted ? 'text-white/30 blur-[2px] select-none' : 'text-white/80'
            }`}>
              {l.projectName}
            </span>
            <PlatformTag platform={l.platform} />
          </div>
        ))}
        {launches.length > 6 && (
          <span className="text-white/30 text-[10px] text-center">
            +{launches.length - 6} more
          </span>
        )}
      </div>
    </div>
  );
}
