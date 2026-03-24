import { Tags, Bell, BellOff } from 'lucide-react';
import { useAppStore } from '../../store/app.store';
import { useNotificationStore } from '../../store/notification.store';
import { useLaunches } from '../../hooks/useLaunches';
import { PanelShell } from './PanelShell';
import { PanelSettingsPopover } from './PanelSettingsPopover';

const CATEGORIES = ['Launchpad', 'NFT', 'Airdrop', 'Meme', 'GameFi', 'Celebrity', 'Utility', 'Other'];

export function CategoryFilterPanel({ onClose }: { onClose?: () => void }) {
  const activeCats = useAppStore((s) => s.filters.categories);
  const toggle = useAppStore((s) => s.toggleCategory);
  const { data: launches } = useLaunches();

  const total = launches?.length ?? 0;
  const counts: Record<string, number> = {};
  for (const l of launches ?? []) {
    const cats = l.categories.length > 0 ? l.categories : ['Other'];
    for (const key of cats) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }

  return (
    <PanelShell title="CATEGORIES" icon={Tags} iconColor="text-radar-orange" onClose={onClose} className="border-yellow-500/25 bg-[linear-gradient(180deg,rgba(72,60,5,0.28)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(234,179,8,0.1)]">
      <div className="flex flex-col gap-2">
        {CATEGORIES.map((cat) => {
          const count = counts[cat] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const active = activeCats.size === 0 || activeCats.has(cat);

          return (
            <div key={cat} className="flex items-center gap-2 text-sm font-mono group hover:bg-white/[0.03] rounded px-1 py-1 transition-colors">
              <button
                onClick={() => toggle(cat)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border-2 transition-colors flex-shrink-0"
                  style={{
                    borderColor: '#F5C542',
                    backgroundColor: active ? '#F5C542' : 'transparent',
                  }}
                />
                <span className={`tracking-wider text-xs w-20 text-left flex-shrink-0 truncate ${active ? 'text-radar-text' : 'text-radar-muted'}`}>
                  {cat}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden min-w-0 -ml-1">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, backgroundColor: active ? '#F5C542' : '#333' }}
                  />
                </div>
                <span className="text-[10px] text-radar-muted w-6 text-right flex-shrink-0 -ml-2">{pct}%</span>
              </button>
              <div className="flex-shrink-0">
                <CategoryNotificationToggle category={cat} />
              </div>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

function CategoryNotificationToggle({ category }: { category: string }) {
  const panelId = `category:${category}`;
  const stored = useNotificationStore((s) => s.panelSettings[panelId]);
  const enabled = stored?.enabled ?? false; // categories default to disabled

  return (
    <PanelSettingsPopover panelId={panelId}>
      {enabled ? (
        <Bell size={12} className="text-radar-amber" />
      ) : (
        <BellOff size={12} className="text-radar-muted" />
      )}
    </PanelSettingsPopover>
  );
}
