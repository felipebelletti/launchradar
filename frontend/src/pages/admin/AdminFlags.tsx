import { useState, useEffect } from 'react';
import { AlertTriangle, Check, Ban, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface FlagData {
  id: string;
  userId: string;
  severity: string;
  reason: string;
  ipAddress: string;
  country: string | null;
  city: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  action: string | null;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    twitterHandle: string | null;
    walletAddress: string | null;
    email: string | null;
  };
  session1: { country: string | null; city: string | null; latitude: number | null; longitude: number | null } | null;
  session2: { country: string | null; city: string | null; latitude: number | null; longitude: number | null } | null;
}

type Tab = 'unreviewed' | 'all' | 'high' | 'trial_abuse';

interface TrialFlag {
  id: string;
  type: string;
  userId: string;
  detail: string;
  reviewed: boolean;
  createdAt: string;
}

export function AdminFlags() {
  const [flags, setFlags] = useState<FlagData[]>([]);
  const [trialFlags, setTrialFlags] = useState<TrialFlag[]>([]);
  const [tab, setTab] = useState<Tab>('unreviewed');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchFlags = async () => {
    setLoading(true);

    if (tab === 'trial_abuse') {
      const res = await fetch(`/admin/trial-flags?page=${page}&limit=25&reviewed=false`, {
        credentials: 'include',
      });
      const data = (await res.json()) as {
        data: TrialFlag[];
        pagination: { totalPages: number };
      };
      setTrialFlags(data.data);
      setTotalPages(data.pagination.totalPages);
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ page: String(page), limit: '25' });

    if (tab === 'unreviewed') params.set('reviewed', 'false');
    if (tab === 'high') {
      params.set('severity', 'HIGH');
      params.set('reviewed', 'false');
    }

    const res = await fetch(`/admin/flags?${params}`, { credentials: 'include' });
    const data = (await res.json()) as {
      data: FlagData[];
      pagination: { totalPages: number };
    };
    setFlags(data.data);
    setTotalPages(data.pagination.totalPages);
    setLoading(false);
  };

  useEffect(() => {
    fetchFlags();
  }, [tab, page]);

  const handleReview = async (flagId: string, action: string) => {
    await fetch(`/admin/flags/${flagId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action }),
    });
    fetchFlags();
  };

  const handleTrialReview = async (flagId: string, action: string) => {
    await fetch(`/admin/trial-flags/${flagId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action }),
    });
    fetchFlags();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'unreviewed', label: 'Unreviewed' },
    { id: 'all', label: 'All' },
    { id: 'high', label: 'HIGH Only' },
    { id: 'trial_abuse', label: 'Trial Abuse' },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
              tab === id
                ? 'bg-white/10 text-radar-text'
                : 'text-radar-muted hover:text-radar-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Trial Abuse tab */}
      {tab === 'trial_abuse' && (
        loading ? (
          <div className="text-radar-muted text-sm">Loading...</div>
        ) : trialFlags.length === 0 ? (
          <div className="text-radar-muted text-sm p-8 text-center">
            No trial abuse flags
          </div>
        ) : (
          <div className="space-y-3">
            {trialFlags.map((tf) => (
              <div
                key={tf.id}
                className="p-4 rounded-lg bg-radar-panel border border-radar-border flex items-start gap-3"
              >
                <span className="text-xs font-mono px-2 py-0.5 rounded border bg-orange-500/20 text-orange-400 border-orange-500/30">
                  TRIAL
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-radar-text text-sm mb-1">{tf.detail}</p>
                  <span className="text-radar-muted text-xs">
                    User: {tf.userId} &middot;{' '}
                    {formatDistanceToNow(new Date(tf.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {!tf.reviewed && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTrialReview(tf.id, 'dismissed')}
                      title="Dismiss"
                      className="p-1.5 rounded hover:bg-white/10 text-radar-muted
                        hover:text-radar-text transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => handleTrialReview(tf.id, 'blocked')}
                      title="Block trial"
                      className="p-1.5 rounded hover:bg-red-500/20 text-radar-muted
                        hover:text-radar-red transition-colors cursor-pointer"
                    >
                      <Ban size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Location Flags list */}
      {tab !== 'trial_abuse' && (loading ? (
        <div className="text-radar-muted text-sm">Loading...</div>
      ) : flags.length === 0 ? (
        <div className="text-radar-muted text-sm p-8 text-center">
          No flags to review
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => (
            <div
              key={flag.id}
              className="p-4 rounded-lg bg-radar-panel border border-radar-border"
            >
              <div className="flex items-start gap-3">
                <SeverityBadge severity={flag.severity} />

                <div className="flex-1 min-w-0">
                  {/* User info */}
                  <div className="flex items-center gap-2 mb-1">
                    {flag.user.avatarUrl && (
                      <img
                        src={flag.user.avatarUrl}
                        alt=""
                        className="w-5 h-5 rounded-full"
                      />
                    )}
                    <span className="text-radar-text text-sm">
                      {flag.user.displayName ?? flag.user.twitterHandle ?? flag.user.email ?? 'Unknown'}
                    </span>
                    <span className="text-radar-muted text-xs">
                      {formatDistanceToNow(new Date(flag.createdAt), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Reason */}
                  <p className="text-radar-text text-sm mb-2">{flag.reason}</p>

                  {/* Locations side by side */}
                  {flag.session1 && flag.session2 && (
                    <div className="flex gap-4 text-xs text-radar-muted">
                      <span>
                        Session 1: {flag.session1.city ?? '?'}, {flag.session1.country ?? '?'}
                      </span>
                      <span className="text-radar-amber">→</span>
                      <span>
                        Session 2: {flag.session2.city ?? '?'}, {flag.session2.country ?? '?'}
                      </span>
                    </div>
                  )}

                  {/* Inline map for HIGH severity */}
                  {flag.severity === 'HIGH' && flag.session1 && flag.session2 &&
                    flag.session1.latitude != null && flag.session2.latitude != null && (
                    <FlagMap session1={flag.session1} session2={flag.session2} />
                  )}
                </div>

                {/* Actions */}
                {!flag.reviewedAt && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleReview(flag.id, 'dismissed')}
                      title="Dismiss"
                      className="p-1.5 rounded hover:bg-white/10 text-radar-muted
                        hover:text-radar-text transition-colors cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => handleReview(flag.id, 'warned')}
                      title="Warn user"
                      className="p-1.5 rounded hover:bg-radar-amber/20 text-radar-muted
                        hover:text-radar-amber transition-colors cursor-pointer"
                    >
                      <AlertTriangle size={14} />
                    </button>
                    <button
                      onClick={() => handleReview(flag.id, 'suspended')}
                      title="Suspend account"
                      className="p-1.5 rounded hover:bg-red-500/20 text-radar-muted
                        hover:text-radar-red transition-colors cursor-pointer"
                    >
                      <Ban size={14} />
                    </button>
                  </div>
                )}

                {flag.reviewedAt && (
                  <span className="flex items-center gap-1 text-xs text-radar-muted">
                    <Check size={12} />
                    {flag.action}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm rounded bg-white/5 text-radar-muted
              hover:bg-white/10 disabled:opacity-30 cursor-pointer"
          >
            Prev
          </button>
          <span className="px-3 py-1 text-sm text-radar-muted">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm rounded bg-white/5 text-radar-muted
              hover:bg-white/10 disabled:opacity-30 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function FlagMap({
  session1,
  session2,
}: {
  session1: { country: string | null; city: string | null; latitude: number | null; longitude: number | null };
  session2: { country: string | null; city: string | null; latitude: number | null; longitude: number | null };
}) {
  const center: [number, number] = [
    (session1.latitude! + session2.latitude!) / 2,
    (session1.longitude! + session2.longitude!) / 2,
  ];

  return (
    <div className="h-32 mt-2 rounded overflow-hidden">
      <MapContainer
        center={center}
        zoom={2}
        scrollWheelZoom={false}
        className="h-full w-full"
        style={{ background: '#0A0A0F' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <CircleMarker
          center={[session1.latitude!, session1.longitude!]}
          radius={6}
          pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.7 }}
        >
          <Tooltip>{session1.city ?? '?'}, {session1.country ?? '?'}</Tooltip>
        </CircleMarker>
        <CircleMarker
          center={[session2.latitude!, session2.longitude!]}
          radius={6}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.7 }}
        >
          <Tooltip>{session2.city ?? '?'}, {session2.country ?? '?'}</Tooltip>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    HIGH: 'bg-red-500/20 text-red-400 border-red-500/30',
    MEDIUM: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    LOW: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  return (
    <span
      className={`text-xs font-mono px-2 py-0.5 rounded border ${
        colors[severity] ?? 'text-radar-muted border-white/10'
      }`}
    >
      {severity}
    </span>
  );
}
