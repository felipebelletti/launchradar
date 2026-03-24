const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string; iconSrc?: string; glowClass: string }> = {
  Launchpad:  { label: 'LAUNCHPAD',  color: '#F5C542', icon: '\uD83D\uDE80', glowClass: '' },
  NFT:        { label: 'NFT',        color: '#9945FF', icon: '\uD83C\uDFA8', glowClass: '' },
  Airdrop:    { label: 'AIRDROP',    color: '#00D4FF', icon: '\uD83E\uDE82', glowClass: 'glow-cyan' },
  Meme:       { label: 'MEME',       color: '#FF6B6B', icon: '', iconSrc: '/pepe.svg', glowClass: '' },
  GameFi:     { label: 'GAMEFI',     color: '#00E676', icon: '\uD83C\uDFAE', glowClass: '' },
  Celebrity:  { label: 'CELEBRITY',  color: '#FF69B4', icon: '', iconSrc: '/elon.svg', glowClass: '' },
  Utility:    { label: 'UTILITY',    color: '#38BDF8', icon: '\u2699\uFE0F', glowClass: '' },
  Other:      { label: 'OTHER',      color: '#6B7280', icon: '\u25C6', glowClass: '' },
};

export function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG['Other']!;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wider whitespace-nowrap flex-shrink-0 ${cfg.glowClass}`}
      style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}
    >
      {cfg.iconSrc
        ? <img src={cfg.iconSrc} alt="" className="w-3.5 h-3.5 inline-block" />
        : <span>{cfg.icon}</span>
      }
      {cfg.label}
    </span>
  );
}
