import { useState, useEffect } from 'react';
import { Radio, Database, Clock, Wifi, WifiOff, AlertCircle, RefreshCw } from 'lucide-react';

interface AlphaGateStats {
  socket: {
    status: string;
    connectedAt: string | null;
    disconnectedAt: string | null;
    lastError: string | null;
    errorAt: string | null;
  };
  stream: {
    mode: string;
    liveAt: string | null;
    lastBackfillAt: string | null;
    lastBackfillCount: number;
  };
  cursor: {
    value: number;
    date: string;
  };
  stats: {
    totalProcessed: number;
    totalSources: number;
    sourcesToday: number;
    sources24h: number;
    lastProcessed: { name: string; handle: string; platform: string | null; at: string } | null;
  };
  recentRecords: {
    id: string;
    projectName: string;
    twitterHandle: string | null;
    chain: string | null;
    platform: string | null;
    platforms: string[];
    status: string;
    confidenceScore: number;
    createdAt: string;
  }[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected'
      ? 'bg-green-400'
      : status === 'disconnected'
        ? 'bg-yellow-400'
        : status === 'error'
          ? 'bg-red-400'
          : 'bg-white/20';

  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    STUB: 'bg-white/10 text-white/40',
    PARTIAL: 'bg-blue-500/20 text-blue-400',
    CONFIRMED: 'bg-cyan-500/20 text-cyan-400',
    VERIFIED: 'bg-green-500/20 text-green-400',
    LIVE: 'bg-amber-500/20 text-amber-400',
  };

  return (
    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${styles[status] ?? 'bg-white/10 text-white/40'}`}>
      {status}
    </span>
  );
}

export function AdminAlphaGate() {
  const [data, setData] = useState<AlphaGateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchData() {
    setLoading(true);
    setError(null);
    fetch('/admin/alphagate', { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setData(d as AlphaGateStats))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return <div className="text-radar-muted text-sm">Loading AlphaGate stats...</div>;
  }

  if (error && !data) {
    return <div className="text-radar-red text-sm">Failed to load: {error}</div>;
  }

  if (!data) return null;

  const socketIcon =
    data.socket.status === 'connected' ? Wifi
    : data.socket.status === 'error' ? AlertCircle
    : WifiOff;
  const SocketIcon = socketIcon;

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-radar-text text-sm font-medium tracking-wider">ALPHAGATE INTEGRATION</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-radar-muted hover:text-radar-text transition p-1 cursor-pointer disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Status cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Socket status */}
        <div className="p-3 rounded-lg bg-radar-panel border border-radar-border">
          <div className="flex items-center gap-2 mb-2">
            <SocketIcon size={13} className={data.socket.status === 'connected' ? 'text-green-400' : 'text-radar-red'} />
            <span className="text-radar-muted text-[10px] uppercase tracking-wider">Socket</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusDot status={data.socket.status} />
            <span className="text-radar-text text-sm font-mono capitalize">{data.socket.status}</span>
          </div>
          {data.socket.connectedAt && (
            <p className="text-radar-muted text-[10px] mt-1">
              since {timeAgo(data.socket.connectedAt)}
            </p>
          )}
          {data.socket.lastError && (
            <p className="text-red-400/70 text-[10px] mt-1 truncate" title={data.socket.lastError}>
              {data.socket.lastError}
            </p>
          )}
        </div>

        {/* Stream mode */}
        <div className="p-3 rounded-lg bg-radar-panel border border-radar-border">
          <div className="flex items-center gap-2 mb-2">
            <Radio size={13} className="text-radar-cyan" />
            <span className="text-radar-muted text-[10px] uppercase tracking-wider">Stream</span>
          </div>
          <span className="text-radar-text text-sm font-mono capitalize">{data.stream.mode}</span>
          {data.stream.liveAt && (
            <p className="text-radar-muted text-[10px] mt-1">
              live since {timeAgo(data.stream.liveAt)}
            </p>
          )}
        </div>

        {/* Today's imports */}
        <div className="p-3 rounded-lg bg-radar-panel border border-radar-border">
          <div className="flex items-center gap-2 mb-2">
            <Database size={13} className="text-radar-amber" />
            <span className="text-radar-muted text-[10px] uppercase tracking-wider">Imports (24h)</span>
          </div>
          <span className="text-radar-text text-xl font-mono">{data.stats.sources24h}</span>
          <p className="text-radar-muted text-[10px] mt-1">
            {data.stats.sourcesToday} today / {data.stats.totalSources} total
          </p>
        </div>

        {/* Cursor */}
        <div className="p-3 rounded-lg bg-radar-panel border border-radar-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={13} className="text-purple-400" />
            <span className="text-radar-muted text-[10px] uppercase tracking-wider">Cursor</span>
          </div>
          <span className="text-radar-text text-sm font-mono">{timeAgo(data.cursor.date)}</span>
          <p className="text-radar-muted text-[10px] mt-1 truncate" title={data.cursor.date}>
            {new Date(data.cursor.date).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Last backfill */}
      {data.stream.lastBackfillAt && (
        <div className="p-3 rounded-lg bg-radar-panel border border-radar-border">
          <span className="text-radar-muted text-[10px] uppercase tracking-wider">Last Backfill</span>
          <div className="flex items-center gap-4 mt-1">
            <span className="text-radar-text text-sm font-mono">
              {data.stream.lastBackfillCount} projects
            </span>
            <span className="text-radar-muted text-xs">
              {timeAgo(data.stream.lastBackfillAt)}
            </span>
          </div>
        </div>
      )}

      {/* Last processed */}
      {data.stats.lastProcessed && (
        <div className="p-3 rounded-lg bg-radar-panel border border-radar-border">
          <span className="text-radar-muted text-[10px] uppercase tracking-wider">Last Processed</span>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-radar-text text-sm">{data.stats.lastProcessed.name}</span>
            {data.stats.lastProcessed.handle && (
              <span className="text-radar-muted text-xs">@{data.stats.lastProcessed.handle}</span>
            )}
            {data.stats.lastProcessed.platform && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-radar-cyan">
                {data.stats.lastProcessed.platform}
              </span>
            )}
            <span className="text-radar-muted text-xs ml-auto">
              {timeAgo(data.stats.lastProcessed.at)}
            </span>
          </div>
        </div>
      )}

      {/* Recent records table */}
      <div className="rounded-lg bg-radar-panel border border-radar-border overflow-hidden">
        <div className="px-3 py-2 border-b border-radar-border">
          <span className="text-radar-muted text-[10px] uppercase tracking-wider">
            Recent Imports (24h)
          </span>
        </div>
        {data.recentRecords.length === 0 ? (
          <div className="px-3 py-4 text-radar-muted text-xs text-center">
            No imports in the last 24 hours
          </div>
        ) : (
          <div className="divide-y divide-radar-border">
            {data.recentRecords.map((r) => (
              <div key={r.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                <span className="text-radar-text truncate max-w-[180px]" title={r.projectName}>
                  {r.projectName}
                </span>
                {r.twitterHandle && (
                  <span className="text-radar-muted truncate max-w-[120px]">
                    @{r.twitterHandle}
                  </span>
                )}
                {r.platform && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-radar-cyan">
                    {r.platform}
                  </span>
                )}
                <StatusBadge status={r.status} />
                <span className="text-radar-muted text-[10px] ml-auto whitespace-nowrap">
                  {timeAgo(r.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
