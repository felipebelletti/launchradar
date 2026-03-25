import { Link } from 'lucide-react';
import { useAppStore } from '../../store/app.store';
import { useLaunches } from '../../hooks/useLaunches';
import { PanelShell } from './PanelShell';

const PLATFORMS = ['solana', 'ethereum', 'base', 'bsc', 'pump.fun', 'arbitrum', 'optimism', 'polygon', 'avalanche', 'sui', 'aptos', 'ton'];

const PLATFORM_COLORS: Record<string, string> = {
  solana: '#9945FF',
  ethereum: '#627EEA',
  base: '#0052FF',
  bsc: '#F3BA2F',
  'pump.fun': '#00D4FF',
  arbitrum: '#28A0F0',
  optimism: '#FF0420',
  polygon: '#8247E5',
  avalanche: '#E84142',
  sui: '#4DA2FF',
  aptos: '#2DD8A3',
  ton: '#0098EA',
};

/** Map raw DB platform values (lowercased) to canonical display keys */
const PLATFORM_ALIAS_TO_KEY: Record<string, string> = {
  solana: 'solana',
  sol: 'solana',
  ethereum: 'ethereum',
  eth: 'ethereum',
  base: 'base',
  bsc: 'bsc',
  binance: 'bsc',
  bnb: 'bsc',
  'pump.fun': 'pump.fun',
  pump: 'pump.fun',
  pumpfun: 'pump.fun',
  arbitrum: 'arbitrum',
  arb: 'arbitrum',
  optimism: 'optimism',
  op: 'optimism',
  polygon: 'polygon',
  matic: 'polygon',
  avalanche: 'avalanche',
  avax: 'avalanche',
  sui: 'sui',
  aptos: 'aptos',
  apt: 'aptos',
  ton: 'ton',
  toncoin: 'ton',
};

const PLATFORM_DISPLAY: Record<string, string> = {
  'pump.fun': 'PUMP.FUN',
};

function normalizePlatform(raw: string | null | undefined): string {
  if (!raw) return 'unknown';
  return PLATFORM_ALIAS_TO_KEY[raw.toLowerCase()] ?? raw.toLowerCase();
}

export function PlatformFilterPanel({ onClose }: { onClose?: () => void }) {
  const activePlatforms = useAppStore((s) => s.filters.platforms);
  const toggle = useAppStore((s) => s.togglePlatform);
  const { data: launches } = useLaunches();

  const total = launches?.length ?? 0;
  const counts: Record<string, number> = {};
  for (const l of launches ?? []) {
    const key = normalizePlatform(l.platform);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  // Only show platforms that have at least 1 launch or are in the active filter
  const visiblePlatforms = PLATFORMS.filter(
    (p) => (counts[p] ?? 0) > 0 || activePlatforms.has(p),
  );

  return (
    <PanelShell title="PLATFORMS" icon={Link} iconColor="text-radar-cyan" onClose={onClose} className="border-indigo-500/25 bg-[linear-gradient(180deg,rgba(15,10,72,0.28)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(99,102,241,0.1)]">
      <div className="flex flex-col gap-2">
        {visiblePlatforms.map((platform) => {
          const count = counts[platform] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const active = activePlatforms.size === 0 || activePlatforms.has(platform);
          const color = PLATFORM_COLORS[platform] ?? '#888';

          return (
            <button
              key={platform}
              onClick={() => toggle(platform)}
              className="flex items-center gap-2 text-sm font-mono group hover:bg-white/[0.03] rounded px-1 py-1 transition-colors"
            >
              <span
                className="w-2.5 h-2.5 rounded-full border-2 transition-colors"
                style={{
                  borderColor: color,
                  backgroundColor: active ? color : 'transparent',
                }}
              />
              <span className={`uppercase tracking-wider text-xs flex-1 text-left ${active ? 'text-radar-text' : 'text-radar-muted'}`}>
                {PLATFORM_DISPLAY[platform] ?? platform}
              </span>
              <div className="w-20 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: active ? color : '#333' }}
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
