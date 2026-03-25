const PLATFORM_COLORS: Record<string, { bg: string; text: string }> = {
  solana:    { bg: '#9945FF22', text: '#9945FF' },
  ethereum:  { bg: '#627EEA22', text: '#627EEA' },
  base:      { bg: '#0052FF22', text: '#0052FF' },
  bsc:       { bg: '#F3BA2F22', text: '#F3BA2F' },
  'pump.fun': { bg: '#00D4FF22', text: '#00D4FF' },
  arbitrum:  { bg: '#28A0F022', text: '#28A0F0' },
  optimism:  { bg: '#FF042022', text: '#FF0420' },
  polygon:   { bg: '#8247E522', text: '#8247E5' },
  avalanche: { bg: '#E8414222', text: '#E84142' },
  sui:       { bg: '#4DA2FF22', text: '#4DA2FF' },
  aptos:     { bg: '#2DD8A322', text: '#2DD8A3' },
  ton:       { bg: '#0098EA22', text: '#0098EA' },
};

const PLATFORM_LABELS: Record<string, string> = {
  solana: 'SOL',
  ethereum: 'ETH',
  base: 'BASE',
  bsc: 'BSC',
  'pump.fun': 'PUMP',
  arbitrum: 'ARB',
  optimism: 'OP',
  polygon: 'POLYGON',
  avalanche: 'AVAX',
  sui: 'SUI',
  aptos: 'APT',
  ton: 'TON',
};

export function PlatformTag({ platform }: { platform: string | null }) {
  if (!platform) return null;
  const key = platform.toLowerCase();
  const colors = PLATFORM_COLORS[key] ?? { bg: '#ffffff11', text: '#888' };
  const label = PLATFORM_LABELS[key] ?? platform.toUpperCase();

  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wider whitespace-nowrap flex-shrink-0"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  );
}
