import {
  Monitor, LayoutList, Plus, RotateCcw,
  CalendarClock, Radio, Link, Tags, Flame, Eye, Ban,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { useAppStore } from '../../store/app.store';
import { NewPill } from '../shared/NewPill';
import { ConnectionDot } from '../shared/ConnectionDot';

const ALL_PANELS: { id: string; label: string; icon: ComponentType<LucideProps>; color: string }[] = [
  { id: 'calendar',  label: 'Calendar',   icon: CalendarClock,     color: 'text-radar-amber' },
  { id: 'live-feed', label: 'Live Feed',  icon: Radio,             color: 'text-radar-red' },
  { id: 'chain',     label: 'Chains',     icon: Link,              color: 'text-radar-cyan' },
  { id: 'category',  label: 'Categories', icon: Tags,              color: 'text-radar-orange' },
  { id: 'heatmap',   label: 'Heatmap',    icon: Flame,             color: 'text-radar-amber' },
  { id: 'watchlist', label: 'Watchlist',  icon: Eye,               color: 'text-sky-400' },
  { id: 'cancelled', label: 'Cancelled', icon: Ban,               color: 'text-rose-400' },
];

export function TopNav() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const closedPanels = useAppStore((s) => s.closedPanels);
  const restorePanel = useAppStore((s) => s.restorePanel);
  const resetLayout = useAppStore((s) => s.resetLayout);

  const closedList = ALL_PANELS.filter((p) => closedPanels.has(p.id));

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-radar-border bg-radar-bg/80 backdrop-blur-md sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-2xl tracking-wider text-radar-amber">LAUNCHRADAR</h1>
        <NewPill />
      </div>

      <div className="flex items-center gap-3">
        <ConnectionDot />

        {/* Restore closed panels */}
        {closedList.length > 0 && (
          <div className="flex items-center gap-1">
            {closedList.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => restorePanel(p.id)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono text-radar-muted
                             hover:text-radar-text bg-white/[0.03] rounded transition-colors group"
                  title={`Restore ${p.label}`}
                >
                  <Icon size={10} className={`${p.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
                  {p.label}
                  <Plus size={8} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                </button>
              );
            })}
          </div>
        )}

        {/* Reset layout */}
        <button
          onClick={resetLayout}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono text-radar-muted
                     hover:text-radar-text bg-white/[0.03] rounded transition-colors"
          title="Reset layout to default"
        >
          <RotateCcw size={10} />
          RESET
        </button>

        {/* Mode toggle */}
        <div className="flex items-center bg-white/[0.04] rounded-lg p-0.5">
          <button
            onClick={() => setMode('terminal')}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-mono transition-colors ${
              mode === 'terminal' ? 'bg-radar-amber/15 text-radar-amber' : 'text-radar-muted hover:text-radar-text'
            }`}
          >
            <Monitor size={12} />
            TERMINAL
          </button>
          <button
            onClick={() => setMode('simple')}
            className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-mono transition-colors ${
              mode === 'simple' ? 'bg-radar-amber/15 text-radar-amber' : 'text-radar-muted hover:text-radar-text'
            }`}
          >
            <LayoutList size={12} />
            SIMPLE
          </button>
        </div>
      </div>
    </header>
  );
}
