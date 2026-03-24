import { useState, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CalendarCell } from './CalendarCell';
import { CalendarDayExpansion } from './CalendarDayExpansion';
import type { LaunchRecord } from '../../../types';

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

interface CalendarDay {
  date: Date;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
}

function getMonthDays(year: number, month: number): CalendarDay[] {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const firstDay = new Date(year, month, 1);
  // Monday=0 offset: JS getDay() returns 0=Sun, we want Mon=0
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const days: CalendarDay[] = [];

  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, 1 - startOffset + i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    days.push({
      date,
      dateStr,
      isCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
      isToday: dateStr === todayStr,
    });
  }

  return days;
}

function getWeekDays(baseDate: Date): CalendarDay[] {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Find Monday of this week
  const day = baseDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + mondayOffset);

  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    days.push({
      date,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  return days;
}

export function CalendarGridView({
  viewMode,
  year,
  month,
  weekStart,
  launchesByDate,
}: {
  viewMode: 'week' | 'month';
  year: number;
  month: number;
  weekStart: Date;
  launchesByDate: Map<string, LaunchRecord[]>;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const calendarDays = useMemo(
    () => viewMode === 'month' ? getMonthDays(year, month) : getWeekDays(weekStart),
    [viewMode, year, month, weekStart],
  );

  const handleDayClick = (dateStr: string) => {
    setExpandedDate((prev) => prev === dateStr ? null : dateStr);
  };

  // Group days into rows of 7 for inline expansion
  const rows: CalendarDay[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    rows.push(calendarDays.slice(i, i + 7));
  }

  return (
    <div className="h-full overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-mono text-white/30 tracking-widest py-2 bg-[#0A0A0F]"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day rows with inline expansion */}
      <div className="flex flex-col gap-px bg-white/[0.04]">
        {rows.map((row, rowIdx) => {
          const expandedInRow = row.find((d) => d.dateStr === expandedDate);
          const expandedLaunches = expandedInRow
            ? launchesByDate.get(expandedInRow.dateStr) ?? []
            : [];

          return (
            <div key={rowIdx}>
              <div className="grid grid-cols-7 gap-px">
                {row.map((day) => (
                  <CalendarCell
                    key={day.dateStr}
                    date={day.date}
                    dateStr={day.dateStr}
                    isCurrentMonth={day.isCurrentMonth}
                    isToday={day.isToday}
                    isExpanded={expandedDate === day.dateStr}
                    launches={launchesByDate.get(day.dateStr) ?? []}
                    viewMode={viewMode}
                    onClick={() => handleDayClick(day.dateStr)}
                  />
                ))}
              </div>
              <AnimatePresence>
                {expandedInRow && (
                  <CalendarDayExpansion
                    key={expandedInRow.dateStr}
                    date={expandedInRow.date}
                    launches={expandedLaunches}
                    onClose={() => setExpandedDate(null)}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
