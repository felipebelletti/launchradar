import { useState, useMemo, useRef } from 'react';
import { CalendarClock, ChevronDown, ChevronRight, RotateCcw, GripVertical, LayoutGrid, Columns3, Lock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCalendar } from '../../../hooks/useCalendar';
import { useCalendarStore } from '../../../store/calendar.store';
import { PanelShell } from '../PanelShell';
import { PanelSettingsPopover } from '../PanelSettingsPopover';
import { LaunchCard } from '../../cards/LaunchCard';
import { GatedContent } from '../../shared/GatedContent';
import { UpgradeButton } from '../../shared/UpgradeButton';
import { CalendarGridView } from './CalendarGridView';
import { CalendarNav } from './CalendarNav';
import { usePlan } from '../../../hooks/usePlan';
import type { LaunchRecord, Plan } from '../../../types';

function GhostCard() {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
      <div className="flex justify-between items-start">
        <div className="h-4 w-24 bg-white/10 rounded" />
        <div className="h-4 w-16 bg-amber-400/20 rounded" />
      </div>
      <div className="h-3 w-12 bg-white/10 rounded" />
      <div className="h-3 w-20 bg-white/10 rounded" />
      <div className="h-3 w-16 bg-amber-400/10 rounded" />
    </div>
  );
}

const COLUMNS: Record<string, { label: string; requiredPlan: Plan | null; blurAmount: number; opacity: number }> = {
  hour: { label: 'HOUR', requiredPlan: null, blurAmount: 6, opacity: 0.45 },
  today: { label: 'TODAY', requiredPlan: null, blurAmount: 6, opacity: 0.45 },
  week: { label: 'WEEK', requiredPlan: 'scout', blurAmount: 7, opacity: 0.45 },
  live: { label: 'LIVE', requiredPlan: null, blurAmount: 6, opacity: 0.45 },
  tbd: { label: 'TBD', requiredPlan: 'alpha', blurAmount: 8, opacity: 0.40 },
};

const COLUMN_STYLES: Record<string, { labelClass: string; prefix: React.ReactNode }> = {
  live:  { labelClass: 'text-cyan-400',        prefix: <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" /> },
  today: { labelClass: 'text-white',           prefix: null },
  hour:  { labelClass: 'text-white',           prefix: null },
  week:  { labelClass: 'text-white/50',        prefix: null },
  tbd:   { labelClass: 'text-white/30 italic', prefix: null },
};

const VIEW_STORAGE_KEY = 'launchradar:calendar-view';

function loadView(): 'columns' | 'calendar' {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === 'calendar' || v === 'columns') return v;
  } catch { /* ignore */ }
  return 'columns';
}


function groupByDate(data: { hour: LaunchRecord[]; today: LaunchRecord[]; week: LaunchRecord[]; live: LaunchRecord[]; tbd: LaunchRecord[] }): Map<string, LaunchRecord[]> {
  const map = new Map<string, LaunchRecord[]>();
  const all = [...data.hour, ...data.today, ...data.week, ...data.live];
  const seen = new Set<string>();
  for (const launch of all) {
    if (seen.has(launch.id)) continue;
    seen.add(launch.id);
    if (!launch.launchDate) continue;
    if (launch.status === 'CANCELLED' || launch.status === 'STALE') continue;
    const key = launch.launchDate.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(launch);
  }
  return map;
}

export function CalendarPanel({ onClose }: { onClose?: () => void }) {
  const { data, isLoading } = useCalendar();
  const { has } = usePlan();
  const { order, collapsed, reorder, toggleCollapsed, reset } = useCalendarStore();

  const [view, setView] = useState<'columns' | 'calendar'>(loadView);
  const [gridMode, setGridMode] = useState<'week' | 'month'>('month');

  // Navigation state (local, not in Zustand)
  const now = new Date();
  const [navYear, setNavYear] = useState(now.getFullYear());
  const [navMonth, setNavMonth] = useState(now.getMonth());
  const [navWeekStart, setNavWeekStart] = useState(() => {
    const d = new Date();
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
  });

  const toggleView = (v: 'columns' | 'calendar') => {
    setView(v);
    localStorage.setItem(VIEW_STORAGE_KEY, v);
  };

  // Column view drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    e.stopPropagation();
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragEnter = (idx: number) => (e: React.DragEvent) => {
    e.stopPropagation();
    dragCounter.current++;
    setOverIdx(idx);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setOverIdx(null);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    if (dragIdx !== null && dragIdx !== idx) {
      reorder(dragIdx, idx);
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setDragIdx(null);
    setOverIdx(null);
    dragCounter.current = 0;
  };

  const launchesByDate = useMemo(() => data ? groupByDate(data) : new Map<string, LaunchRecord[]>(), [data]);

  const navPrev = () => {
    if (gridMode === 'month') {
      if (navMonth === 0) { setNavMonth(11); setNavYear(navYear - 1); }
      else setNavMonth(navMonth - 1);
    } else {
      setNavWeekStart(new Date(navWeekStart.getFullYear(), navWeekStart.getMonth(), navWeekStart.getDate() - 7));
    }
  };

  const navNext = () => {
    if (gridMode === 'month') {
      if (navMonth === 11) { setNavMonth(0); setNavYear(navYear + 1); }
      else setNavMonth(navMonth + 1);
    } else {
      setNavWeekStart(new Date(navWeekStart.getFullYear(), navWeekStart.getMonth(), navWeekStart.getDate() + 7));
    }
  };

  const navToday = () => {
    const t = new Date();
    setNavYear(t.getFullYear());
    setNavMonth(t.getMonth());
    const day = t.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    setNavWeekStart(new Date(t.getFullYear(), t.getMonth(), t.getDate() + mondayOffset));
  };

  const weekViewLocked = !has('alpha');

  const actions = (
    <div className="flex items-center gap-1">
      {/* View toggle */}
      <button
        onClick={() => toggleView('columns')}
        className={`p-1 transition-colors ${view === 'columns' ? 'text-radar-amber' : 'text-radar-muted hover:text-radar-amber'}`}
        title="Column view"
      >
        <Columns3 size={12} />
      </button>
      <button
        onClick={() => toggleView('calendar')}
        className={`p-1 transition-colors ${view === 'calendar' ? 'text-radar-amber' : 'text-radar-muted hover:text-radar-amber'}`}
        title="Calendar view"
      >
        <LayoutGrid size={12} />
      </button>

      {/* Calendar-specific controls */}
      {view === 'calendar' && (
        <>
          <span className="w-px h-3 bg-radar-border mx-1" />
          <CalendarNav
            year={navYear}
            month={navMonth}
            viewMode={gridMode}
            weekStart={navWeekStart}
            onPrev={navPrev}
            onNext={navNext}
            onToday={navToday}
          />
          <span className="w-px h-3 bg-radar-border mx-1" />
          <button
            onClick={() => !weekViewLocked && setGridMode('week')}
            className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
              gridMode === 'week'
                ? 'bg-radar-amber/20 text-radar-amber'
                : weekViewLocked
                  ? 'text-white/20 cursor-not-allowed'
                  : 'text-radar-muted hover:text-white'
            }`}
            title={weekViewLocked ? 'Week view — Alpha feature' : 'Week view'}
          >
            {weekViewLocked && <Lock size={8} className="inline mr-1 -mt-0.5" />}
            WEEK
          </button>
          <button
            onClick={() => setGridMode('month')}
            className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
              gridMode === 'month'
                ? 'bg-radar-amber/20 text-radar-amber'
                : 'text-radar-muted hover:text-white'
            }`}
            title="Month view"
          >
            MONTH
          </button>
        </>
      )}

      {/* Column-specific controls */}
      {view === 'columns' && (
        <button
          onClick={reset}
          className="p-1 hover:text-radar-amber text-radar-muted transition-colors"
          title="Reset calendar layout"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );

  return (
    <PanelShell
      title="LAUNCH CALENDAR"
      icon={CalendarClock}
      onClose={onClose}
      actions={actions}
      className="border-amber-500/25 bg-[linear-gradient(180deg,rgba(72,50,5,0.28)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(245,197,66,0.1)]"
    >
      {isLoading && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          SCANNING...
        </div>
      )}
      {data && (
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {view === 'columns' ? (
              <div className="flex gap-2 h-full overflow-x-auto overflow-y-hidden radar-scrollbar pb-1">
                {order.map((key, idx) => {
                  const col = COLUMNS[key];
                  if (!col) return null;
                  const launches = (data[key as keyof typeof data] ?? []) as LaunchRecord[];
                  const isCollapsed = collapsed.has(key);
                  const isDragging = dragIdx === idx;
                  const isOver = overIdx === idx && dragIdx !== idx;

                  const stopGridDrag = (e: React.MouseEvent | React.PointerEvent) => {
                    e.stopPropagation();
                  };

                  const isColumnGated = !!col.requiredPlan && !has(col.requiredPlan);

                  return (
                    <div key={key} className="flex-1 min-w-[160px] max-w-[260px] h-full">
                      <div
                        className={`no-grid-drag flex flex-col h-full transition-opacity ${isDragging ? 'opacity-40' : ''}`}
                        draggable
                        onMouseDown={stopGridDrag}
                        onPointerDown={stopGridDrag}
                        onDragStart={handleDragStart(idx)}
                        onDragEnter={handleDragEnter(idx)}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                      >
                        <div
                          className={`flex items-center justify-between border-b pb-1 mb-1 flex-shrink-0 transition-colors ${
                            isOver ? 'border-radar-amber' : 'border-radar-border'
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <GripVertical size={10} className="text-radar-muted/40 cursor-grab flex-shrink-0" />
                            <button
                              onClick={() => toggleCollapsed(key)}
                              className="flex items-center gap-1 hover:text-radar-amber transition-colors"
                            >
                              {isCollapsed ? <ChevronRight size={10} className="text-radar-muted" /> : <ChevronDown size={10} className="text-radar-muted" />}
                              <div className="flex items-center gap-1.5 min-w-0">
                                {(COLUMN_STYLES[key] ?? { prefix: null }).prefix}
                                <h3 className={`text-[10px] font-mono font-bold tracking-widest uppercase truncate ${(COLUMN_STYLES[key] ?? { labelClass: 'text-white/40' }).labelClass}`}>
                                  {col.label}
                                </h3>
                              </div>
                            </button>
                            {isCollapsed && launches.length > 0 && (
                              <span className="text-[9px] font-mono text-radar-amber/60 ml-1">
                                ({launches.length})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {isColumnGated && (
                              <UpgradeButton targetPlan={col.requiredPlan!} size="xs" className="ml-auto" />
                            )}
                            <PanelSettingsPopover panelId={`calendar-${key}`} />
                          </div>
                        </div>
                        {key === 'today' && <div className="h-px bg-white/10 w-full" />}
                        {!isCollapsed && (
                          <div className="flex-1 min-h-0 overflow-y-auto radar-scrollbar">
                            <div className="flex flex-col gap-2 pb-1">
                              {/* Ghost cards for gated + empty columns */}
                              {isColumnGated && launches.length === 0 && (
                                [0, 1, 2].map(i => (
                                  <GatedContent key={i} requires={col.requiredPlan!} blurAmount={col.blurAmount} opacity={col.opacity}>
                                    <GhostCard />
                                  </GatedContent>
                                ))
                              )}
                              {!isColumnGated && launches.length === 0 && (
                                <p className="text-[10px] font-mono text-radar-muted/50 text-center py-4">
                                  NO SIGNALS IN RANGE
                                </p>
                              )}
                              {launches.map((l) => (
                                isColumnGated
                                  ? (
                                    <GatedContent key={l.id} requires={col.requiredPlan!} blurAmount={col.blurAmount} opacity={col.opacity}>
                                      <LaunchCard launch={l} />
                                    </GatedContent>
                                  )
                                  : l.redacted
                                    ? (
                                      <div key={l.id} className="blur-[3px] opacity-40 select-none pointer-events-none">
                                        <LaunchCard launch={l} />
                                      </div>
                                    )
                                    : <LaunchCard key={l.id} launch={l} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <CalendarGridView
                viewMode={gridMode}
                year={navYear}
                month={navMonth}
                weekStart={navWeekStart}
                launchesByDate={launchesByDate}
              />
            )}
          </motion.div>
        </AnimatePresence>
      )}
      {!isLoading && !data && (
        <div className="flex items-center justify-center h-full text-radar-muted font-mono text-sm">
          NO SIGNALS IN RANGE
        </div>
      )}
    </PanelShell>
  );
}
