const CATEGORY_CONFIG: Record<string, { label: string; color: string; glowClass: string }> = {
  Launchpad:  { label: 'LAUNCHPAD',  color: '#F5C542', glowClass: '' },
  NFT:        { label: 'NFT',        color: '#9945FF', glowClass: '' },
  Airdrop:    { label: 'AIRDROP',    color: '#00D4FF', glowClass: 'glow-cyan' },
  Meme:       { label: 'MEME',       color: '#FF6B6B', glowClass: '' },
  GameFi:     { label: 'GAMEFI',     color: '#00E676', glowClass: '' },
  Celebrity:  { label: 'CELEBRITY',  color: '#FF69B4', glowClass: '' },
  Utility:    { label: 'UTILITY',    color: '#38BDF8', glowClass: '' },
  Other:      { label: 'OTHER',      color: '#6B7280', glowClass: '' },
};

export function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG['Other']!;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wider whitespace-nowrap flex-shrink-0 ${cfg.glowClass}`}
      style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}
    >
      {cfg.label}
    </span>
  );
}
