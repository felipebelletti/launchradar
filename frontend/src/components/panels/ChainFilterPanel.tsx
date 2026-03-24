import { Link } from 'lucide-react';
import { useAppStore } from '../../store/app.store';
import { useLaunches } from '../../hooks/useLaunches';
import { PanelShell } from './PanelShell';

const CHAINS = ['solana', 'ethereum', 'base', 'bsc', 'pump'];

const CHAIN_COLORS: Record<string, string> = {
  solana: '#9945FF',
  ethereum: '#627EEA',
  base: '#0052FF',
  bsc: '#F3BA2F',
  pump: '#00D4FF',
};

/** Map raw DB chain values (lowercased) to canonical display keys */
const CHAIN_ALIAS_TO_KEY: Record<string, string> = {
  solana: 'solana',
  sol: 'solana',
  ethereum: 'ethereum',
  eth: 'ethereum',
  base: 'base',
  bsc: 'bsc',
  binance: 'bsc',
  bnb: 'bsc',
  pump: 'pump',
  'pump.fun': 'pump',
  pumpfun: 'pump',
};

function normalizeChain(raw: string | null | undefined): string {
  if (!raw) return 'unknown';
  return CHAIN_ALIAS_TO_KEY[raw.toLowerCase()] ?? raw.toLowerCase();
}

export function ChainFilterPanel({ onClose }: { onClose?: () => void }) {
  const activeChains = useAppStore((s) => s.filters.chains);
  const toggle = useAppStore((s) => s.toggleChain);
  const { data: launches } = useLaunches();

  const total = launches?.length ?? 0;
  const counts: Record<string, number> = {};
  for (const l of launches ?? []) {
    const key = normalizeChain(l.chain);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return (
    <PanelShell title="CHAINS" icon={Link} iconColor="text-radar-cyan" onClose={onClose} className="border-indigo-500/25 bg-[linear-gradient(180deg,rgba(15,10,72,0.28)_0%,rgba(10,10,15,0.92)_48%,rgba(10,10,15,1)_100%)] shadow-[inset_0_1px_0_0_rgba(99,102,241,0.1)]">
      <div className="flex flex-col gap-2">
        {CHAINS.map((chain) => {
          const count = counts[chain] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const active = activeChains.size === 0 || activeChains.has(chain);
          const color = CHAIN_COLORS[chain] ?? '#888';

          return (
            <button
              key={chain}
              onClick={() => toggle(chain)}
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
                {chain === 'pump' ? 'PUMP.FUN' : chain}
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
