import { Tags } from 'lucide-react';
import { useAppStore } from '../../store/app.store';
import { useLaunches } from '../../hooks/useLaunches';
import { PanelShell } from './PanelShell';

const CATEGORIES = ['DeFi', 'NFT', 'GameFi', 'Launchpad', 'L2', 'Meme', 'Other'];

export function CategoryFilterPanel({ onClose }: { onClose?: () => void }) {
  const activeCats = useAppStore((s) => s.filters.categories);
  const toggle = useAppStore((s) => s.toggleCategory);
  const { data: launches } = useLaunches();

  const total = launches?.length ?? 0;
  const counts: Record<string, number> = {};
  for (const l of launches ?? []) {
    const key = l.category ?? 'Other';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return (
    <PanelShell title="CATEGORIES" icon={Tags} iconColor="text-radar-orange" onClose={onClose}>
      <div className="flex flex-col gap-2">
        {CATEGORIES.map((cat) => {
          const count = counts[cat] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const active = activeCats.size === 0 || activeCats.has(cat);

          return (
            <button
              key={cat}
              onClick={() => toggle(cat)}
              className="flex items-center gap-2 text-sm font-mono group hover:bg-white/[0.03] rounded px-1 py-1 transition-colors"
            >
              <span
                className="w-2.5 h-2.5 rounded-full border-2 transition-colors"
                style={{
                  borderColor: '#F5C542',
                  backgroundColor: active ? '#F5C542' : 'transparent',
                }}
              />
              <span className={`tracking-wider text-xs flex-1 text-left ${active ? 'text-radar-text' : 'text-radar-muted'}`}>
                {cat}
              </span>
              <div className="w-20 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: active ? '#F5C542' : '#333' }}
                />
              </div>
              <span className="text-[10px] text-radar-muted w-8 text-right">{pct}%</span>
            </button>
          );
        })}
      </div>
    </PanelShell>
  );
}
