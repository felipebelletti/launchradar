import { Monitor, LayoutList, Plus, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/app.store';
import { NewPill } from '../shared/NewPill';
import { ConnectionDot } from '../shared/ConnectionDot';

const ALL_PANELS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'live-feed', label: 'Live Feed' },
  { id: 'chain', label: 'Chains' },
  { id: 'category', label: 'Categories' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'tweets', label: 'Tweets' },
  { id: 'watchlist', label: 'Watchlist' },
];

export function TopNav() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const closedPanels = useAppStore((s) => s.closedPanels);
  const restorePanel = useAppStore((s) => s.restorePanel);
  const resetPanels = useAppStore((s) => s.resetPanels);

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
            {closedList.map((p) => (
              <button
                key={p.id}
                onClick={() => restorePanel(p.id)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-radar-muted
                           hover:text-radar-text bg-white/[0.03] rounded transition-colors"
                title={`Restore ${p.label}`}
              >
                <Plus size={10} />
                {p.label}
              </button>
            ))}
            <button
              onClick={resetPanels}
              className="p-1 text-radar-muted hover:text-radar-text transition-colors"
              title="Reset Layout"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        )}

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
