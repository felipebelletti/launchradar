import { useCalendar } from '../../hooks/useCalendar';
import { useLaunches } from '../../hooks/useLaunches';
import { useAppStore } from '../../store/app.store';
import { LaunchCard } from '../cards/LaunchCard';
import { LaunchRow } from '../cards/LaunchRow';
import type { LaunchRecord } from '../../types';

const CHAINS = ['solana', 'ethereum', 'base', 'bsc', 'pump'];
const CATEGORIES = ['DeFi', 'NFT', 'GameFi', 'Launchpad', 'L2', 'Meme', 'Other'];

export function SimpleLayout() {
  const { data: calendar } = useCalendar();
  const { data: launches } = useLaunches();
  const activeChains = useAppStore((s) => s.filters.chains);
  const activeCats = useAppStore((s) => s.filters.categories);
  const toggleChain = useAppStore((s) => s.toggleChain);
  const toggleCat = useAppStore((s) => s.toggleCategory);

  const sections = [
    { label: 'NEXT HOUR', items: calendar?.hour ?? [] },
    { label: 'TODAY', items: calendar?.today ?? [] },
    { label: 'THIS WEEK', items: calendar?.week ?? [] },
    { label: 'TBD', items: calendar?.tbd ?? [] },
    { label: 'LIVE', items: calendar?.live ?? [] },
  ];

  const sorted = launches?.slice().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Horizontal filter toggles */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CHAINS.map((c) => (
          <button
            key={c}
            onClick={() => toggleChain(c)}
            className={`px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap border transition-colors ${
              activeChains.size === 0 || activeChains.has(c)
                ? 'border-radar-amber/30 text-radar-amber bg-radar-amber/10'
                : 'border-radar-border text-radar-muted'
            }`}
          >
            {c.toUpperCase()}
          </button>
        ))}
        <span className="w-px h-6 bg-radar-border self-center" />
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => toggleCat(c)}
            className={`px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap border transition-colors ${
              activeCats.size === 0 || activeCats.has(c)
                ? 'border-radar-amber/30 text-radar-amber bg-radar-amber/10'
                : 'border-radar-border text-radar-muted'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Calendar sections */}
      {sections.map((sec) => (
        <div key={sec.label}>
          <h2 className="text-xs font-mono font-bold tracking-widest text-radar-muted mb-3 border-b border-radar-border pb-1">
            {sec.label}
          </h2>
          {sec.items.length === 0 ? (
            <p className="text-[10px] font-mono text-radar-muted/50 text-center py-4">
              NO SIGNALS IN RANGE
            </p>
          ) : (
            <div className="grid gap-2">
              {(sec.items as LaunchRecord[]).map((l) => (
                <LaunchCard key={l.id} launch={l} />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Live feed */}
      <div>
        <h2 className="text-xs font-mono font-bold tracking-widest text-radar-muted mb-3 border-b border-radar-border pb-1">
          LIVE FEED
        </h2>
        {sorted?.map((l) => (
          <LaunchRow key={l.id} launch={l} />
        ))}
        {(!sorted || sorted.length === 0) && (
          <p className="text-[10px] font-mono text-radar-muted/50 text-center py-4">
            NO SIGNALS IN RANGE
          </p>
        )}
      </div>
    </div>
  );
}
