import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Shield, Ban, Unlock, Trash2, Globe } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface UserDetail {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  twitterAvatar: string | null;
  walletAddress: string | null;
  twitterId: string | null;
  twitterHandle: string | null;
  email: string | null;
  isAdmin: boolean;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  plan: string;
  trialPlan: string | null;
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  trialUsed: boolean;
  stripeCustomerId: string | null;
  stripeSubId: string | null;
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  sessions: SessionInfo[];
  locationFlags: FlagInfo[];
}

interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress: string;
  userAgent: string;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

interface FlagInfo {
  id: string;
  severity: string;
  reason: string;
  createdAt: string;
  reviewedAt: string | null;
  action: string | null;
}

interface Props {
  userId: string;
  onBack: () => void;
}

export function AdminUserDetail({ userId, onBack }: Props) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/admin/users/${userId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => setUser((res as { data: UserDetail }).data))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleAction = async (action: string) => {
    if (!user) return;
    const endpoint = `/admin/users/${user.id}/${action}`;
    await fetch(endpoint, { method: 'POST', credentials: 'include' });
    // Reload
    const res = await fetch(`/admin/users/${userId}`, { credentials: 'include' });
    const data = (await res.json()) as { data: UserDetail };
    setUser(data.data);
  };

  const handleRevokeAll = async () => {
    if (!user) return;
    await fetch(`/admin/users/${user.id}/sessions`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const res = await fetch(`/admin/users/${userId}`, { credentials: 'include' });
    const data = (await res.json()) as { data: UserDetail };
    setUser(data.data);
  };

  if (loading || !user) {
    return <div className="text-radar-muted text-sm">Loading...</div>;
  }

  const avatar = user.avatarUrl ?? user.twitterAvatar;
  const name = user.displayName ?? user.twitterHandle ?? user.email ?? user.walletAddress;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-radar-muted hover:text-radar-text cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3">
          {avatar ? (
            <img src={avatar} alt="" className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/10" />
          )}
          <div>
            <h2 className="text-radar-text font-medium">{name}</h2>
            <p className="text-radar-muted text-xs">
              Joined {format(new Date(user.createdAt), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex-1" />
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('warn')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
              bg-radar-amber/10 text-radar-amber hover:bg-radar-amber/20 cursor-pointer"
          >
            <Shield size={12} />
            Warn
          </button>
          {user.isSuspended ? (
            <button
              onClick={() => handleAction('unsuspend')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                bg-green-500/10 text-green-400 hover:bg-green-500/20 cursor-pointer"
            >
              <Unlock size={12} />
              Unsuspend
            </button>
          ) : (
            <button
              onClick={() => handleAction('suspend')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                bg-red-500/10 text-radar-red hover:bg-red-500/20 cursor-pointer"
            >
              <Ban size={12} />
              Suspend
            </button>
          )}
          <button
            onClick={handleRevokeAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
              bg-white/5 text-radar-muted hover:bg-white/10 cursor-pointer"
          >
            <Trash2 size={12} />
            Revoke Sessions
          </button>
        </div>
      </div>

      {/* Profile info */}
      <div className="grid grid-cols-3 gap-4">
        <InfoCard label="Auth Methods">
          <div className="space-y-1 text-sm">
            {user.walletAddress && (
              <p className="text-radar-text font-mono text-xs">
                Wallet: {user.walletAddress.slice(0, 10)}...
              </p>
            )}
            {user.twitterHandle && (
              <p className="text-radar-text">Twitter: @{user.twitterHandle}</p>
            )}
            {user.email && <p className="text-radar-text">Email: {user.email}</p>}
          </div>
        </InfoCard>
        <InfoCard label="Status">
          <div className="space-y-1 text-sm">
            <p>
              {user.isSuspended ? (
                <span className="text-radar-red">
                  Suspended{' '}
                  {user.suspendedAt &&
                    formatDistanceToNow(new Date(user.suspendedAt), { addSuffix: true })}
                </span>
              ) : (
                <span className="text-green-400">Active</span>
              )}
            </p>
            {user.suspendedReason && (
              <p className="text-radar-muted text-xs">{user.suspendedReason}</p>
            )}
            <p className="text-radar-muted">
              Last active:{' '}
              {user.lastActiveAt
                ? formatDistanceToNow(new Date(user.lastActiveAt), { addSuffix: true })
                : 'never'}
            </p>
          </div>
        </InfoCard>
        <InfoCard label="Plan">
          <div className="space-y-1 text-sm">
            <p className="text-radar-text font-mono font-bold">
              {user.plan}
              {user.trialExpiresAt && new Date(user.trialExpiresAt) > new Date() && (
                <span className="ml-2 text-xs bg-amber-400/20 text-amber-400 px-1.5 py-0.5 rounded">
                  TRIAL
                </span>
              )}
            </p>
            {user.trialExpiresAt && new Date(user.trialExpiresAt) > new Date() ? (
              <p className="text-radar-muted text-xs">
                Trial expires {formatDistanceToNow(new Date(user.trialExpiresAt), { addSuffix: true })}
              </p>
            ) : user.trialUsed ? (
              <p className="text-radar-muted text-xs">Trial used</p>
            ) : (
              <p className="text-radar-muted text-xs">Trial not started</p>
            )}
            {user.subscription && (
              <p className="text-radar-muted text-xs">
                Stripe: {user.subscription.status}
                {user.subscription.cancelAtPeriodEnd && ' (cancelling)'}
              </p>
            )}
          </div>
        </InfoCard>
      </div>

      {/* Sessions */}
      <div className="p-4 rounded-lg bg-radar-panel border border-radar-border">
        <h3 className="text-radar-text text-sm font-medium mb-3 flex items-center gap-2">
          <Globe size={14} />
          Active Sessions ({user.sessions.length})
        </h3>
        {user.sessions.length === 0 ? (
          <p className="text-radar-muted text-sm">No active sessions</p>
        ) : (
          <div className="space-y-2">
            {user.sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-2 rounded bg-white/5 text-sm"
              >
                <div className="flex-1">
                  <span className="text-radar-text">
                    {s.city ?? '?'}, {s.country ?? '?'}
                  </span>
                  <span className="text-radar-muted ml-2">— {s.ipAddress}</span>
                </div>
                <span className="text-radar-muted text-xs">
                  {formatDistanceToNow(new Date(s.lastSeenAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session Map */}
      <SessionMap sessions={user.sessions} />

      {/* Location Flags */}
      {user.locationFlags.length > 0 && (
        <div className="p-4 rounded-lg bg-radar-panel border border-radar-border">
          <h3 className="text-radar-text text-sm font-medium mb-3">
            Location Flags ({user.locationFlags.length})
          </h3>
          <div className="space-y-2">
            {user.locationFlags.map((flag) => (
              <div
                key={flag.id}
                className="flex items-center gap-3 p-2 rounded bg-white/5 text-sm"
              >
                <SeverityBadge severity={flag.severity} />
                <span className="text-radar-text flex-1">{flag.reason}</span>
                <span className="text-radar-muted text-xs">
                  {format(new Date(flag.createdAt), 'MMM d, HH:mm')}
                </span>
                {flag.reviewedAt ? (
                  <span className="text-xs text-radar-muted px-2 py-0.5 rounded bg-white/5">
                    {flag.action}
                  </span>
                ) : (
                  <span className="text-xs text-radar-amber">pending</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionMap({ sessions }: { sessions: SessionInfo[] }) {
  const geoSessions = useMemo(
    () => sessions.filter((s) => s.latitude != null && s.longitude != null),
    [sessions],
  );

  if (geoSessions.length === 0) return null;

  const center: [number, number] = [
    geoSessions.reduce((sum, s) => sum + s.latitude!, 0) / geoSessions.length,
    geoSessions.reduce((sum, s) => sum + s.longitude!, 0) / geoSessions.length,
  ];

  return (
    <div className="p-4 rounded-lg bg-radar-panel border border-radar-border">
      <h3 className="text-radar-text text-sm font-medium mb-3 flex items-center gap-2">
        <Globe size={14} />
        Session Map
      </h3>
      <div className="h-64 rounded-lg overflow-hidden">
        <MapContainer
          center={center}
          zoom={3}
          scrollWheelZoom={false}
          className="h-full w-full"
          style={{ background: '#0A0A0F' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {geoSessions.map((s) => (
            <CircleMarker
              key={s.id}
              center={[s.latitude!, s.longitude!]}
              radius={7}
              pathOptions={{
                color: s.isActive ? '#f59e0b' : '#6b7280',
                fillColor: s.isActive ? '#f59e0b' : '#6b7280',
                fillOpacity: 0.7,
              }}
            >
              <Tooltip>
                <span className="text-xs">
                  {s.city ?? '?'}, {s.country ?? '?'} — {s.ipAddress}
                  <br />
                  {formatDistanceToNow(new Date(s.lastSeenAt), { addSuffix: true })}
                </span>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg bg-radar-panel border border-radar-border">
      <h3 className="text-radar-muted text-xs uppercase tracking-wider mb-2">
        {label}
      </h3>
      {children}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    HIGH: 'bg-red-500/20 text-red-400',
    MEDIUM: 'bg-orange-500/20 text-orange-400',
    LOW: 'bg-yellow-500/20 text-yellow-400',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${colors[severity] ?? 'text-radar-muted'}`}>
      {severity}
    </span>
  );
}
