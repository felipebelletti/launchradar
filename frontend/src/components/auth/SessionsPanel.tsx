import { useState, useEffect } from 'react';
import { Monitor, Smartphone, Globe, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress: string;
  userAgent: string;
  country: string | null;
  city: string | null;
  isCurrent: boolean;
}

function parseDevice(ua: string): { device: string; icon: typeof Monitor } {
  if (/iPhone|iPad|Android|Mobile/i.test(ua)) {
    return { device: 'Mobile', icon: Smartphone };
  }
  return { device: 'Desktop', icon: Monitor };
}

function parseBrowser(ua: string): string {
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
  if (/Firefox/i.test(ua)) return 'Firefox';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
  if (/Edg/i.test(ua)) return 'Edge';
  return 'Unknown';
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/auth/sessions', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { sessions: SessionInfo[] };
        setSessions(data.sessions);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const revokeSession = async (id: string) => {
    await fetch(`/auth/sessions/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const revokeAllOthers = async () => {
    const others = sessions.filter((s) => !s.isCurrent);
    await Promise.all(others.map((s) => revokeSession(s.id)));
  };

  if (loading) {
    return (
      <div className="text-radar-muted text-sm p-4">Loading sessions...</div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-radar-text font-mono text-xs uppercase tracking-wider">
        Your Sessions
      </h3>

      <div className="space-y-2">
        {sessions.map((session) => {
          const { device, icon: DeviceIcon } = parseDevice(session.userAgent);
          const browser = parseBrowser(session.userAgent);
          const location = [session.city, session.country]
            .filter(Boolean)
            .join(', ');

          return (
            <div
              key={session.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/5"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  session.isCurrent ? 'bg-green-500' : 'bg-radar-muted'
                }`}
              />
              <DeviceIcon size={16} className="text-radar-muted" />
              <div className="flex-1 min-w-0">
                <div className="text-radar-text text-sm">
                  {session.isCurrent ? 'This device' : device} — {browser}
                </div>
                <div className="text-radar-muted text-xs flex items-center gap-1">
                  {location && (
                    <>
                      <Globe size={10} />
                      {location} —{' '}
                    </>
                  )}
                  {session.isCurrent
                    ? 'active now'
                    : formatDistanceToNow(new Date(session.lastSeenAt), {
                        addSuffix: true,
                      })}
                </div>
              </div>
              {!session.isCurrent && (
                <button
                  onClick={() => revokeSession(session.id)}
                  className="text-radar-muted hover:text-radar-red transition-colors cursor-pointer"
                  title="Revoke session"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {sessions.filter((s) => !s.isCurrent).length > 0 && (
        <button
          onClick={revokeAllOthers}
          className="text-radar-red text-xs hover:underline cursor-pointer"
        >
          Revoke all other sessions
        </button>
      )}
    </div>
  );
}
