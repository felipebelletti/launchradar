const CHAIN_COLORS: Record<string, { bg: string; text: string }> = {
  solana:   { bg: '#9945FF22', text: '#9945FF' },
  ethereum: { bg: '#627EEA22', text: '#627EEA' },
  base:     { bg: '#0052FF22', text: '#0052FF' },
  bsc:      { bg: '#F3BA2F22', text: '#F3BA2F' },
  pump:     { bg: '#00D4FF22', text: '#00D4FF' },
};

const CHAIN_LABELS: Record<string, string> = {
  solana: 'SOL',
  ethereum: 'ETH',
  base: 'BASE',
  bsc: 'BSC',
  pump: 'PUMP',
};

export function ChainTag({ chain }: { chain: string | null }) {
  if (!chain) return null;
  const key = chain.toLowerCase();
  const colors = CHAIN_COLORS[key] ?? { bg: '#ffffff11', text: '#888' };
  const label = CHAIN_LABELS[key] ?? chain.toUpperCase();

  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wider"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  );
}
