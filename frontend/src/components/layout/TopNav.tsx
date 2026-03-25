import {
  LayoutDashboard, AlignJustify, Plus, RotateCcw,
  CalendarClock, Radio, Link, Tags, Eye, Trash2,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { useAppStore } from '../../store/app.store';
import { NewPill } from '../shared/NewPill';
import { ConnectionDot } from '../shared/ConnectionDot';
import { AccountDropdown } from '../auth/AccountDropdown';
import { NavPlanBadge } from './NavPlanBadge';

const ALL_PANELS: { id: string; label: string; icon: ComponentType<LucideProps>; color: string }[] = [
  { id: 'calendar',  label: 'Calendar',   icon: CalendarClock,     color: 'text-radar-amber' },
  { id: 'signal-intel', label: 'Signal Intel', icon: Radio,          color: 'text-radar-red' },
  { id: 'platform',  label: 'Platforms',  icon: Link,              color: 'text-radar-cyan' },
  { id: 'category',  label: 'Categories', icon: Tags,              color: 'text-radar-orange' },
  { id: 'watchlist', label: 'Watchlist',  icon: Eye,               color: 'text-sky-400' },
  { id: 'trash',     label: 'Trash Bin',  icon: Trash2,            color: 'text-zinc-400' },
];

interface TopNavProps {
  onOpenAdmin?: () => void;
  onNavigate?: (path: string) => void;
}

export function TopNav({ onOpenAdmin, onNavigate }: TopNavProps = {}) {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const closedPanels = useAppStore((s) => s.closedPanels);
  const restorePanel = useAppStore((s) => s.restorePanel);
  const resetLayout = useAppStore((s) => s.resetLayout);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const closedList = ALL_PANELS.filter((p) => closedPanels.has(p.id));

  return (
    <header className="flex items-center px-4 py-2 border-b border-radar-border bg-radar-bg/80 backdrop-blur-md sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <h1 className="font-display text-2xl tracking-wider text-radar-amber">LAUNCHRADAR</h1>
        <NewPill />
      </div>

      <div className="flex items-center gap-3 ml-auto">
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

        {/* Reset layout — icon only */}
        <button
          onClick={resetLayout}
          title="Reset layout"
          className="p-1.5 text-white/20 hover:text-white/50 transition
                     rounded hover:bg-white/5"
        >
          <RotateCcw size={13} />
        </button>

        {/* Mode toggle */}
        <div className="flex items-center rounded border border-white/10 overflow-hidden">
          {(['terminal', 'simple'] as const).map((m, i) => (
            <div key={m} className="flex items-center">
              {i > 0 && <div className="w-px h-4 bg-white/10" />}
              <button
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono tracking-widest transition-colors ${
                  mode === m ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'
                }`}
              >
                {m === 'terminal' ? <LayoutDashboard size={11} /> : <AlignJustify size={11} />}
                {m.toUpperCase()}
              </button>
            </div>
          ))}
        </div>

        {/* Account + Plan badge */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-1.5 text-white/40 hover:text-white/70
                         transition text-[11px] font-mono tracking-widest"
            >
              <User size={12} />
              ACCOUNT
            </button>

            <div className="w-px h-3 bg-white/10" />
            <NavPlanBadge onClick={() => setShowUserMenu((v) => !v)} />
          </div>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <AccountDropdown
                onClose={() => setShowUserMenu(false)}
                onNavigate={(path) => onNavigate?.(path)}
                onOpenAdmin={onOpenAdmin}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}
