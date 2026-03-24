import { useState, useEffect } from 'react';
import { Users, Activity, AlertTriangle, UserPlus } from 'lucide-react';

interface Stats {
  totalUsers: number;
  activeToday: number;
  activeWeek: number;
  newSignups: number;
  openFlags: { HIGH: number; MEDIUM: number; LOW: number };
  planDistribution: { FREE: number; SCOUT: number; ALPHA: number; PRO: number };
  trialAbuseCount: number;
  mrr: number;
  arr: number;
}

export function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/admin/stats', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setStats(data as Stats))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats) {
    return <div className="text-radar-muted text-sm">Loading stats...</div>;
  }

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-radar-cyan' },
    { label: 'Active Today', value: stats.activeToday, icon: Activity, color: 'text-green-400' },
    { label: 'Active This Week', value: stats.activeWeek, icon: Activity, color: 'text-radar-amber' },
    { label: 'New Signups (7d)', value: stats.newSignups, icon: UserPlus, color: 'text-purple-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="p-4 rounded-lg bg-radar-panel border border-radar-border"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={14} className={color} />
              <span className="text-radar-muted text-xs uppercase tracking-wider">
                {label}
              </span>
            </div>
            <div className="text-radar-text text-2xl font-mono">{value}</div>
          </div>
        ))}
      </div>

      {/* Open flags */}
      <div className="p-4 rounded-lg bg-radar-panel border border-radar-border">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={14} className="text-radar-amber" />
          <span className="text-radar-text text-sm font-medium">
            Open Location Flags
          </span>
          {stats.trialAbuseCount > 0 && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded ml-auto">
              {stats.trialAbuseCount} trial abuse
            </span>
          )}
        </div>
        <div className="flex gap-6">
          <div>
            <span className="text-red-400 text-2xl font-mono">
              {stats.openFlags.HIGH}
            </span>
            <span className="text-radar-muted text-xs ml-1">HIGH</span>
          </div>
          <div>
            <span className="text-radar-orange text-2xl font-mono">
              {stats.openFlags.MEDIUM}
            </span>
            <span className="text-radar-muted text-xs ml-1">MEDIUM</span>
          </div>
          <div>
            <span className="text-yellow-400 text-2xl font-mono">
              {stats.openFlags.LOW}
            </span>
            <span className="text-radar-muted text-xs ml-1">LOW</span>
          </div>
        </div>
      </div>

      {/* Plan Distribution */}
      <div className="p-4 rounded-lg bg-radar-panel border border-radar-border">
        <h3 className="text-radar-text text-sm font-medium mb-4">
          PLAN DISTRIBUTION
        </h3>
        <div className="space-y-3">
          {(Object.entries(stats.planDistribution) as [string, number][]).map(([plan, count]) => {
            const pct = stats.totalUsers > 0 ? Math.round((count / stats.totalUsers) * 100) : 0;
            const colors: Record<string, string> = {
              FREE: 'bg-white/20',
              SCOUT: 'bg-cyan-400',
              ALPHA: 'bg-amber-400',
              PRO: 'bg-purple-400',
            };
            return (
              <div key={plan} className="flex items-center gap-3">
                <span className="text-radar-muted text-xs font-mono w-12">{plan}</span>
                <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${colors[plan] ?? 'bg-white/20'}`}
                    style={{ width: `${Math.max(pct, 1)}%` }}
                  />
                </div>
                <span className="text-radar-text text-xs font-mono w-20 text-right">
                  {count} users
                </span>
                <span className="text-radar-muted text-xs w-10 text-right">
                  ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-6 mt-4 pt-4 border-t border-radar-border">
          <div>
            <span className="text-green-400 text-xl font-mono">
              ${stats.mrr.toLocaleString()}
            </span>
            <span className="text-radar-muted text-xs ml-1">MRR</span>
          </div>
          <div>
            <span className="text-green-400 text-xl font-mono">
              ${stats.arr.toLocaleString()}
            </span>
            <span className="text-radar-muted text-xs ml-1">ARR</span>
          </div>
        </div>
      </div>
    </div>
  );
}
