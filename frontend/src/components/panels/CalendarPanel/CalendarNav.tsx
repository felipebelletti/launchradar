import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_NAMES = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

export function CalendarNav({
  year,
  month,
  viewMode,
  weekStart,
  onPrev,
  onNext,
  onToday,
}: {
  year: number;
  month: number;
  viewMode: 'week' | 'month';
  weekStart?: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const label = viewMode === 'month'
    ? `${MONTH_NAMES[month]} ${year}`
    : weekStart
      ? `WEEK OF ${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getDate()}`
      : `${MONTH_NAMES[month]} ${year}`;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onPrev}
        className="text-white/40 hover:text-amber-400 transition p-0.5"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        onClick={onToday}
        className="font-mono text-xs tracking-widest text-white/60 hover:text-amber-400 transition min-w-[100px] text-center"
      >
        {label}
      </button>
      <button
        onClick={onNext}
        className="text-white/40 hover:text-amber-400 transition p-0.5"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
