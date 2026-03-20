import type { LaunchStatus } from '../../types';

const STATUS_CONFIG: Record<LaunchStatus, { label: string; icon: string; color: string; glowClass: string }> = {
  STUB:      { label: 'SIGNAL',    icon: '\u25C9', color: '#FF4444', glowClass: 'glow-red' },
  PARTIAL:   { label: 'TRACKING',  icon: '\u25CE', color: '#F5A623', glowClass: 'glow-amber' },
  CONFIRMED: { label: 'CONFIRMED', icon: '\u25CF', color: '#F5C542', glowClass: 'glow-amber' },
  VERIFIED:  { label: 'VERIFIED',  icon: '\u2726', color: '#00D4FF', glowClass: 'glow-cyan' },
  LIVE:      { label: 'LIVE',      icon: '\u25CF', color: '#00D4FF', glowClass: 'glow-cyan' },
  STALE:     { label: 'STALE',     icon: '\u25CB', color: '#6B7280', glowClass: '' },
  CANCELLED: { label: 'CANCELLED', icon: '\u2715', color: '#FB7185', glowClass: '' },
};

export function StatusBadge({ status }: { status: LaunchStatus }) {
  const cfg = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-bold tracking-wider ${cfg.glowClass}`}
      style={{ color: cfg.color, backgroundColor: `${cfg.color}15` }}
    >
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
